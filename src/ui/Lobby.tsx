import { useState } from 'react'
import { normalizeRoomCode } from '../net/room'
import { hasGoEasyConfig } from '../net/transport'

interface LobbyProps {
  name: string
  onNameChange: (name: string) => void
  onCreate: () => void
  onJoin: (room: string) => void
  onLocal: () => void
}

const DEMO_PIECES = [
  { label: '帅', color: 'red' },
  { label: '仕', color: 'red' },
  { label: '相', color: 'red' },
  { label: '马', color: 'black' },
  { label: '车', color: 'black' },
  { label: '炮', color: 'black' },
  { label: '卒', color: 'black' },
]

export function Lobby({ name, onNameChange, onCreate, onJoin, onLocal }: LobbyProps) {
  const [roomInput, setRoomInput] = useState('')
  const room = normalizeRoomCode(roomInput)
  const configured = hasGoEasyConfig()

  const join = () => {
    if (room.length < 4) return
    onJoin(room)
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-brand">
          <div className="lobby-pieces" aria-hidden="true">
            {DEMO_PIECES.map((piece) => (
              <span key={piece.label} className={`demo-piece demo-${piece.color}`}>
                {piece.label}
              </span>
            ))}
          </div>
          <p className="eyebrow">两人对弈 · 房间码加入</p>
          <h1>中国象棋</h1>
          <p className="lobby-subtitle">
            打开同一个链接，和朋友在电脑或手机上下完一盘棋。
          </p>
        </div>

        <label className="field">
          <span>你的名字</span>
          <input
            value={name}
            maxLength={16}
            placeholder="给自己起个名字"
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>

        <button type="button" className="btn btn-primary btn-block" onClick={onCreate}>
          创建房间
          <small>生成房间码，你先执红</small>
        </button>

        <div className="join-row">
          <input
            value={roomInput}
            maxLength={12}
            placeholder="输入房间码"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') join()
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={join}
            disabled={room.length < 4}
          >
            加入
          </button>
        </div>

        <button type="button" className="btn btn-ghost btn-block" onClick={onLocal}>
          本地双人
          <small>同一台设备轮流走棋，也可以先熟悉规则</small>
        </button>

        <div className={`lobby-status ${configured ? 'ok' : 'warn'}`}>
          <span className="dot" />
          {configured
            ? '联机服务已配置，可以和朋友跨设备对局'
            : '尚未配置 GoEasy：当前联机只支持同一浏览器的多个标签页'}
        </div>

        <p className="lobby-footnote">
          无需注册 · 六位房间码 · 支持悔棋、求和、认输与聊天
        </p>
      </div>
    </div>
  )
}
