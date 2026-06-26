// Render 向けサーバ。Express + express-ws で常駐し、ルームごとに盤面を
// メモリ内で保持する。盤面の更新は shared/game.ts の reduce() に丸投げする。
import express from 'express'
import expressWs from 'express-ws'
import type { WebSocket } from 'ws'
import {
  createState,
  reduce,
  type GameState,
  type Action,
} from '../shared/game'

const { app } = expressWs(express())
const port = Number(process.env.PORT) || 3001

// ルーム = 盤面 state + 接続中のソケット。roomId で引ける。
type Room = { state: GameState; sockets: Set<WebSocket> }
const rooms = new Map<string, Room>()

const getRoom = (id: string): Room => {
  const existing = rooms.get(id)
  if (existing) return existing
  const room: Room = { state: createState(), sockets: new Set() }
  rooms.set(id, room)
  return room
}

const broadcast = (room: Room) => {
  const message = JSON.stringify({ type: 'state', state: room.state })
  room.sockets.forEach((ws) => ws.readyState === 1 && ws.send(message))
}

// React のビルド成果物を配信
app.use(express.static('web/dist'))

app.ws('/ws', (ws, req) => {
  const roomId =
    typeof req.query.room === 'string' && req.query.room
      ? req.query.room
      : 'lobby'
  const room = getRoom(roomId)
  room.sockets.add(ws)

  // 参加直後に現在の盤面を同期
  ws.send(JSON.stringify({ type: 'state', state: room.state }))

  ws.on('message', (raw) => {
    const action = JSON.parse(raw.toString()) as Action
    room.state = reduce(room.state, action)
    broadcast(room)
  })

  ws.on('close', () => room.sockets.delete(ws))
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
