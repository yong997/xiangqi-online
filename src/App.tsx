import { useEffect, useState, useSyncExternalStore } from 'react'
import { generateRoomCode, joinRoomHash, parseHash, type Route } from './net/room'
import { SessionController } from './net/session'
import { getClientId, loadName, saveName } from './net/storage'
import { GameScreen } from './ui/GameScreen'
import { Lobby } from './ui/Lobby'

interface GameRouteProps {
  mode: 'online' | 'local'
  room: string
  intent: 'create' | 'join'
  name: string
  onLeave: () => void
}

function GameRoute({ mode, room, intent, name, onLeave }: GameRouteProps) {
  const [session] = useState(
    () =>
      new SessionController({
        mode,
        room,
        intent,
        clientId: getClientId(),
        name: name || '玩家',
      }),
  )

  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )

  useEffect(() => {
    session.start()
    return () => session.stop()
  }, [session])

  return <GameScreen session={session} state={state} onLeave={onLeave} />
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [name, setName] = useState(() => loadName())

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const goHome = () => {
    window.location.hash = '#/'
  }

  const createRoom = () => {
    const room = generateRoomCode()
    // 地址栏保持为干净的加入链接，刷新时仍能凭本地保存的座位回到红方。
    window.history.replaceState(null, '', joinRoomHash(room))
    setRoute({ name: 'game', room, intent: 'create' })
  }

  const joinRoom = (room: string) => {
    window.location.hash = joinRoomHash(room)
  }

  const updateName = (value: string) => {
    setName(value)
    saveName(value)
  }

  if (route.name === 'local') {
    return (
      <GameRoute
        key="local"
        mode="local"
        room="LOCAL"
        intent="create"
        name={name}
        onLeave={goHome}
      />
    )
  }

  if (route.name === 'game') {
    return (
      <GameRoute
        key={`${route.room}:${route.intent}`}
        mode="online"
        room={route.room}
        intent={route.intent}
        name={name}
        onLeave={goHome}
      />
    )
  }

  return (
    <Lobby
      name={name}
      onNameChange={updateName}
      onCreate={createRoom}
      onJoin={joinRoom}
      onLocal={() => {
        window.location.hash = '#/local'
      }}
    />
  )
}
