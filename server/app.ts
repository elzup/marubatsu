// Render 向けサーバ。Express + express-ws で常駐し、ルームごとに盤面を
// メモリ内で保持する。盤面の更新は shared/game.ts の reduce() に丸投げする。
import express from 'express'
import expressWs from 'express-ws'
import type { WebSocket } from 'ws'
import {
  createState,
  reduce,
  assignSeat,
  canAct,
  type GameState,
  type Mark,
} from '../shared/game'
import { actionSchema, tryJson } from '../shared/messages'
import { roomFromQuery } from '../shared/room'

const { app } = expressWs(express())
const port = Number(process.env.PORT) || 3001

// ルーム = 盤面 state + 接続中プレイヤー (socket→席)。roomId で引ける。
type Room = { state: GameState; players: Map<WebSocket, Mark | null> }
const rooms = new Map<string, Room>()

const getRoom = (id: string): Room => {
  const existing = rooms.get(id)
  if (existing) return existing
  const room: Room = { state: createState(), players: new Map() }
  rooms.set(id, room)
  return room
}

const broadcast = (room: Room) => {
  const message = JSON.stringify({ type: 'state', state: room.state })
  room.players.forEach((_mark, ws) => ws.readyState === 1 && ws.send(message))
}

// プレイヤーが抜けて席 (freed) が空いたら、観戦者を 1 人昇格させる。
// これで StrictMode の一時的な席枯れも自己回復し、本番でも空席を埋められる。
const promoteSpectator = (room: Room, freed: Mark) => {
  const occupied = [...room.players.values()].includes(freed)
  if (occupied) return
  for (const [ws, mark] of room.players) {
    if (mark === null && ws.readyState === 1) {
      room.players.set(ws, freed)
      ws.send(JSON.stringify({ type: 'joined', mark: freed }))
      return
    }
  }
}

// React のビルド成果物を配信
app.use(express.static('web/dist'))

app.ws('/ws', (ws, req) => {
  // worker 側と同じ URL パースに統一 (req.url は "/ws?room=xxx")
  const params = new URL(req.url, 'http://localhost').searchParams
  const room = getRoom(roomFromQuery(params))

  // 先着で席を割り当てる (X=1P / O=2P / null=観戦)
  const mark = assignSeat([...room.players.values()])
  room.players.set(ws, mark)

  // 参加直後に席と現在の盤面を同期
  ws.send(JSON.stringify({ type: 'joined', mark }))
  ws.send(JSON.stringify({ type: 'state', state: room.state }))

  ws.on('message', (raw) => {
    // 受信メッセージは untrusted。Zod で検証し、不正なら無視する。
    const parsed = actionSchema.safeParse(tryJson(raw.toString()))
    if (!parsed.success) return
    // 権限チェック: 観戦者や手番でないプレイヤーの操作は無視
    if (!canAct(parsed.data, room.players.get(ws) ?? null, room.state)) return
    room.state = reduce(room.state, parsed.data)
    broadcast(room)
  })

  ws.on('close', () => {
    const left = room.players.get(ws)
    room.players.delete(ws)
    if (left) promoteSpectator(room, left) // 空いた席を観戦者に渡す
  })
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
