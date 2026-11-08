import type {
  Transport,
  TransportKind,
  TransportStatus,
  WireMsg,
} from './types'

/**
 * 本地传输：同一个浏览器的多个标签页通过 BroadcastChannel 互发消息。
 * 用于不配置 GoEasy 时的开发联调；生产环境会自动切换到 GoEasyTransport。
 */
export class LocalTransport implements Transport {
  readonly kind: TransportKind = 'local'

  private readonly room: string
  private readonly channelName: string
  private readonly storageKey: string
  private readonly messageHandlers = new Set<(msg: WireMsg) => void>()
  private readonly statusHandlers = new Set<(status: TransportStatus) => void>()
  private status: TransportStatus = 'connecting'
  private bc: BroadcastChannel | null = null
  private connected = false

  constructor(room: string) {
    this.room = room
    this.channelName = `xq_v1_${room}`
    this.storageKey = `xq_bus_${room}`
  }

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key !== this.storageKey || !event.newValue) return
    try {
      const data = JSON.parse(event.newValue) as { msg?: WireMsg }
      if (data.msg) this.dispatch(data.msg)
    } catch {
      // 忽略无法解析的消息
    }
  }

  private dispatch(msg: WireMsg): void {
    if (!msg || msg.room !== this.room) return
    for (const handler of this.messageHandlers) handler(msg)
  }

  private setStatus(status: TransportStatus): void {
    if (this.status === status) return
    this.status = status
    for (const handler of this.statusHandlers) handler(status)
  }

  async connect(): Promise<void> {
    if (this.connected) return
    this.setStatus('connecting')

    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(this.channelName)
      this.bc.onmessage = (event: MessageEvent) => this.dispatch(event.data as WireMsg)
    } else {
      window.addEventListener('storage', this.onStorage)
    }

    this.connected = true
    this.setStatus('connected')
  }

  send(msg: WireMsg): void {
    if (!this.connected) return
    if (this.bc) {
      this.bc.postMessage(msg)
      return
    }
    try {
      const envelope = { nonce: `${Date.now()}-${Math.random()}`, msg }
      localStorage.setItem(this.storageKey, JSON.stringify(envelope))
    } catch {
      // 存储不可用时忽略
    }
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
    this.connected = false
    this.bc?.close()
    this.bc = null
    window.removeEventListener('storage', this.onStorage)
    this.setStatus('disconnected')
  }
}
