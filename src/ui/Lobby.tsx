import { useState } from 'react'
import {
  msToMinutes,
  PER_MOVE_PRESETS_MIN,
  TOTAL_PRESETS_MIN,
  type TimeControl,
} from '../net/clock'
import { normalizeRoomCode } from '../net/room'
import { hasGoEasyConfig } from '../net/transport'

interface LobbyProps {
  name: string
  onNameChange: (name: string) => void
  timeControl: TimeControl
  onTimeControlChange: (value: TimeControl) => void
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

function TimeLimitPicker({
  label,
  valueMs,
  presets,
  onChange,
}: {
  label: string
  valueMs: number | null
  presets: number[]
  onChange: (ms: number | null) => void
}) {
  const activeMinutes = msToMinutes(valueMs)
  const isCustom = activeMinutes != null && !presets.includes(activeMinutes)
  const [customText, setCustomText] = useState(isCustom ? String(activeMinutes) : '')

  return (
    <div className="tc-row">
      <span className="tc-label">{label}</span>
      <div className="tc-options">
        <button
          type="button"
          className={`tc-chip${valueMs == null ? ' is-on' : ''}`}
          onClick={() => {
            setCustomText('')
            onChange(null)
          }}
        >
          不限
        </button>
        {presets.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={`tc-chip${activeMinutes === minutes ? ' is-on' : ''}`}
            onClick={() => {
              setCustomText('')
              onChange(minutes * 60_000)
            }}
          >
            {minutes} 分
          </button>
        ))}
        <span className={`tc-custom${isCustom ? ' is-on' : ''}`}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            placeholder="自定义"
            value={customText}
            onChange={(event) => {
              const text = event.target.value
              setCustomText(text)
              const minutes = Number(text)
              if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 60) {
                onChange(Math.round(minutes * 60_000))
              }
            }}
          />
          <span className="tc-custom-unit">分</span>
        </span>
      </div>
    </div>
  )
}

export function Lobby({
  name,
  onNameChange,
  timeControl,
  onTimeControlChange,
  onCreate,
  onJoin,
  onLocal,
}: LobbyProps) {
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

        <div className="time-control">
          <div className="time-control-title">对局时限（可选 · 房主设置）</div>
          <TimeLimitPicker
            label="每步限时"
            valueMs={timeControl.perMoveMs}
            presets={PER_MOVE_PRESETS_MIN}
            onChange={(ms) => onTimeControlChange({ ...timeControl, perMoveMs: ms })}
          />
          <TimeLimitPicker
            label="每人总用时"
            valueMs={timeControl.totalMs}
            presets={TOTAL_PRESETS_MIN}
            onChange={(ms) => onTimeControlChange({ ...timeControl, totalMs: ms })}
          />
          <p className="time-control-hint">都不选 = 不限时；任意一项到时即判当前行棋方负。</p>
        </div>

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
