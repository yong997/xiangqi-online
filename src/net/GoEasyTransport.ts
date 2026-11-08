import GoEasyModule from 'goeasy'
import type {
  Transport,
  TransportKind,
  TransportStatus,
  WireMsg,
} from './types'

/**
 * goeasy 包的 GoEasy.d.ts 只声明了静态成员，与实际运行时 API 不一致。
 * 这里统一按运行时对象使用，避免被不完整的类型定义卡住。
 */
type GoEasyInstance = {
  connect(options: Record<string, unknown>): void
  pubsub: {
    subscribe(options: Record<string, unknown>): void
    publish(options: Record<string, unknown>): void
    unsubscribe(options: Record<string, unknown>): void
  }
}

type GoEasyStatic = {
  getInstance(options: Record<string, unknown>): GoEasyInstance
  getConnectionStatus?: () => string
}

const GoEasy = GoEasyModule as unknown as GoEasyStatic

interface GoEasyOptions {
  room: string
  clientId: string
  appkey: string
  host: string
}

let instance: GoEasyInstance | null = null
let instanceOptionsKey = ''
let connectPromise: Promise<GoEasyInstance> | null = null
let connectedClientId: string | null = null

/** 频道 -> 订阅者集合；同一个频道只向 GoEasy 订阅一次。 */
const channelHandlers = new Map<string, Set<(msg: WireMsg) => void>>()
const channelSubscribed = new Set<string>()
const channelSubPromises = new Map<string, Promise<void>>()

function ensureConnected(options: GoEasyOptions): Promise<GoEasyInstance> {
  const key = `${options.appkey}|${options.host}`
  if (instance && instanceOptionsKey !== key) {
    // 极少数情况下 appkey/host 在运行时变化，重新取实例由 GoEasy 内部管理。
    instance = null
    connectedClientId = null
  }

  if (instance && connectedClientId === options.clientId) {
    return Promise.resolve(instance)
  }
  if (connectPromise) return connectPromise

  if (!instance) {
    instance = GoEasy.getInstance({
      host: options.host,
      appkey: options.appkey,
      modules: ['pubsub'],
    })
    instanceOptionsKey = key
  }

  const current = instance
  const promise = new Promise<GoEasyInstance>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('连接实时服务超时，请检查网络后重试'))
    }, 15_000)

    current.connect({
      id: options.clientId,
      onSuccess: () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        connectedClientId = options.clientId
        resolve(current)
      },
      onFailed: (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`连接实时服务失败：${String(error)}`))
      },
      onProgress: () => {
        // 自动重连进行中，状态由 transport 自己维护
      },
    })
  })

  connectPromise = promise
  promise
    .catch(() => undefined)
    .finally(() => {
      if (connectPromise === promise) connectPromise = null
    })
  return promise
}

function ensureSubscribed(channel: string): Promise<void> {
  if (channelSubscribed.has(channel)) return Promise.resolve()
  const pending = channelSubPromises.get(channel)
  if (pending) return pending
  if (!instance) return Promise.reject(new Error('实时服务尚未连接'))

  const promise = new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('订阅房间频道超时'))
    }, 15_000)

    instance!.pubsub.subscribe({
      channel,
      onMessage: (message: { content?: string }) => {
        if (!message?.content) return
        try {
          const msg = JSON.parse(message.content) as WireMsg
          channelHandlers.get(channel)?.forEach((handler) => handler(msg))
        } catch {
          // 忽略非 JSON 消息
        }
      },
      onSuccess: () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        channelSubscribed.add(channel)
        resolve()
      },
      onFailed: (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`订阅房间失败：${String(error)}`))
      },
    })
  })

  channelSubPromises.set(channel, promise)
  promise
    .catch(() => undefined)
    .finally(() => {
      if (channelSubPromises.get(channel) === promise) channelSubPromises.delete(channel)
    })
  return promise
}

/**
 * 生产环境传输：GoEasy pub/sub（杭州节点，国内直连）。
 * 免费版没有历史消息，所以每次连接后必须由会话层主动同步棋局。
 */
export class GoEasyTransport implements Transport {
  readonly kind: TransportKind = 'goeasy'

  private readonly options: GoEasyOptions
  private readonly channel: string
  private readonly messageHandlers = new Set<(msg: WireMsg) => void>()
  private readonly statusHandlers = new Set<(status: TransportStatus) => void>()
  private status: TransportStatus = 'connecting'
  private goEasy: GoEasyInstance | null = null
  private closing = false
  private readonly queue: WireMsg[] = []
  private readonly dispatch = (msg: WireMsg): void => {
    if (msg.room !== this.options.room) return
    for (const handler of this.messageHandlers) handler(msg)
  }

  constructor(options: GoEasyOptions) {
    this.options = options
    this.channel = `xq_v1_${options.room}`
  }

  private setStatus(status: TransportStatus): void {
    if (this.status === status) return
    this.status = status
    for (const handler of this.statusHandlers) handler(status)
  }

  async connect(): Promise<void> {
    if (this.closing) return
    this.setStatus('connecting')

    let handlers = channelHandlers.get(this.channel)
    if (!handlers) {
      handlers = new Set()
      channelHandlers.set(this.channel, handlers)
    }
    handlers.add(this.dispatch)

    try {
      this.goEasy = await ensureConnected(this.options)
      await ensureSubscribed(this.channel)
      if (this.closing) return
      this.setStatus('connected')
      this.flushQueue()
    } catch (error) {
      this.setStatus('disconnected')
      handlers.delete(this.dispatch)
      throw error
    }
  }

  private flushQueue(): void {
    if (!this.goEasy || this.queue.length === 0) return
    const pending = this.queue.splice(0, this.queue.length)
    for (const msg of pending) this.publish(msg)
  }

  private publish(msg: WireMsg): void {
    if (!this.goEasy) {
      this.queue.push(msg)
      return
    }
    this.goEasy.pubsub.publish({
      channel: this.channel,
      message: JSON.stringify(msg),
      onFailed: () => {
        if (this.closing) return
        this.setStatus('disconnected')
        if (this.queue.length < 100) this.queue.push(msg)
      },
    })
  }

  send(msg: WireMsg): void {
    if (this.status !== 'connected') {
      if (this.queue.length < 100) this.queue.push(msg)
      return
    }
    this.publish(msg)
  }

  onMessage(handler: (msg: WireMsg) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onStatus(handler: (status: TransportStatus) => void): () => void {
    this.statusHandlers.add(handler)
    handler(this.status)
    return () => this.statusHandlers.delete(handler)
  }

  close(): void {
    this.closing = true
    const handlers = channelHandlers.get(this.channel)
    handlers?.delete(this.dispatch)
    if (handlers && handlers.size === 0) channelHandlers.delete(this.channel)
    // 保留模块级频道订阅：GoEasy 每个页面只建一条连接，
    // React StrictMode 下会 stop/start 一次，退订再订阅反而容易触发 SDK 的重复订阅错误。
    this.queue.length = 0
    this.setStatus('disconnected')
  }
}
