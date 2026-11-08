import { GoEasyTransport } from './GoEasyTransport'
import { LocalTransport } from './LocalTransport'
import type { Transport } from './types'

/**
 * 配置了 GoEasy appkey 时使用真实联机；否则退回同浏览器多标签的本地传输，
 * 方便在没有外部账号时先把规则、界面和协议跑通。
 */
export function createTransport(room: string, clientId: string): Transport {
  const appkey = (import.meta.env.VITE_GOESAY_APPKEY ?? '').trim()
  if (!appkey) return new LocalTransport(room)

  const host = (import.meta.env.VITE_GOESAY_HOST ?? '').trim() || 'hangzhou.goeasy.io'
  return new GoEasyTransport({ room, clientId, appkey, host })
}

export function hasGoEasyConfig(): boolean {
  return Boolean((import.meta.env.VITE_GOESAY_APPKEY ?? '').trim())
}
