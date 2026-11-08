import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../net/session'

interface ChatPanelProps {
  messages: ReadonlyArray<ChatMessage>
  onSend: (text: string) => void
  disabled?: boolean
  onClose?: () => void
  selfId?: string
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function ChatPanel({ messages, onSend, disabled, onClose, selfId }: ChatPanelProps) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  return (
    <section className="chat-panel">
      <header className="panel-header">
        <h2>聊天</h2>
        {onClose && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭聊天">
            ×
          </button>
        )}
      </header>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">还没有消息，和对手聊聊吧。</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message chat-${message.seat ?? 'system'}${
                message.from === selfId ? ' self' : ''
              }`}
            >
              <div className="chat-meta">
                <span className="chat-name">{message.name}</span>
                <span className="chat-time">{formatTime(message.ts)}</span>
              </div>
              <p>{message.text}</p>
            </div>
          ))
        )}
      </div>

      <form
        className="chat-input-row"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          value={text}
          maxLength={200}
          placeholder={disabled ? '连接后即可聊天' : '说点什么…'}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={disabled || !text.trim()}>
          发送
        </button>
      </form>
    </section>
  )
}
