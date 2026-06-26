// 1 ルーム = 1 つの Durable Object インスタンス。
// インスタンス内に盤面 state を持ち、接続中の全 WebSocket にブロードキャストする。
// 盤面の更新ロジックは Render 側とまったく同じ shared/game.ts の reduce() を使う。
import { DurableObject } from 'cloudflare:workers'
import {
  createState,
  reduce,
  type GameState,
  type Action,
} from '../shared/game'
import type { Env } from './index'

export class RoomDO extends DurableObject<Env> {
  private state: GameState = createState()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // hibernation でメモリが飛んでも復元できるよう storage から読み戻す
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<GameState>('state')) ?? createState()
    })
  }

  // WebSocket 接続を受け付ける (Hibernation API)
  async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    // 参加直後に現在の盤面を同期
    server.send(JSON.stringify({ type: 'state', state: this.state }))
    return new Response(null, { status: 101, webSocket: client })
  }

  // クライアントから Action が届くたびに state を更新して全員へ配信
  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer) {
    const action = JSON.parse(raw as string) as Action
    this.state = reduce(this.state, action)
    await this.ctx.storage.put('state', this.state) // 先に永続化してから配信
    this.broadcast()
  }

  private broadcast() {
    const message = JSON.stringify({ type: 'state', state: this.state })
    this.ctx.getWebSockets().forEach((ws) => ws.send(message))
  }
}
