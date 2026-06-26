import { useGame } from './useGame'

// URL の ?room=xxx でルームを決める (無ければ lobby)。
// ex) http://localhost:3001/?room=abc
const room = new URLSearchParams(location.search).get('room') || 'lobby'

export function App() {
  const { state, send } = useGame(room)

  // まだサーバから盤面が届いていない
  if (!state) return <p className="status">接続中...</p>

  const { board, turn, winner } = state
  const status = winner
    ? `勝者: ${winner}`
    : board.every(Boolean)
      ? '引き分け'
      : `手番: ${turn}`

  return (
    <div className="game">
      <p className="status">{status}</p>

      <div className="board">
        {board.map((cell, i) => (
          <button
            key={i}
            className={`cell ${cell ? cell.toLowerCase() : ''}`}
            disabled={Boolean(winner || cell)}
            onClick={() => send({ type: 'move', index: i })}
          >
            {cell}
          </button>
        ))}
      </div>

      <button className="reset" onClick={() => send({ type: 'reset' })}>
        リセット
      </button>
      <p className="room">room: {room}</p>
    </div>
  )
}
