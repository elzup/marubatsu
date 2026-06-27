// 1 ルーム = 1 つの Durable Object インスタンス。
// インスタンス内に盤面 state を持ち、接続中の全 WebSocket にブロードキャストする。
// 盤面の更新ロジックは Render 側とまったく同じ shared/game.ts の reduce() を使う。
import { DurableObject } from 'cloudflare:workers'
import {
  createState,
  reduce,
  assignSeat,
  canAct,
  seatPresence,
  type GameState,
  type Mark,
} from '../shared/game'
import { actionSchema, tryJson } from '../shared/messages'
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

    // 既存接続の席から空きを先着で割り当てる (X=1P / O=2P / null=観戦)
    const taken = this.ctx
      .getWebSockets()
      .map((ws) => ws.deserializeAttachment() as Mark | null)
    const mark = assignSeat(taken)

    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(mark) // hibernation を跨いで席を保持

    // 参加直後に席と現在の盤面を同期
    server.send(JSON.stringify({ type: 'joined', mark }))
    server.send(JSON.stringify({ type: 'state', state: this.state }))
    // 自分の参加を含めた席の在席を全員へ知らせる (accept 後なので server も含まれる)
    this.broadcastPresence()
    return new Response(null, { status: 101, webSocket: client })
  }

  // クライアントから Action が届くたびに state を更新して全員へ配信
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    // 受信メッセージは untrusted。Zod で検証し、不正なら無視する。
    const parsed = actionSchema.safeParse(tryJson(raw as string))
    if (!parsed.success) return
    // 権限チェック: 観戦者や手番でないプレイヤーの操作は無視
    const mark = ws.deserializeAttachment() as Mark | null
    if (!canAct(parsed.data, mark, this.state)) return
    this.state = reduce(this.state, parsed.data)
    await this.ctx.storage.put('state', this.state) // 先に永続化してから配信
    this.broadcast()
  }

  // プレイヤーが抜けたら、空いた席を観戦者に渡す (自己回復 / 空席埋め)
  webSocketClose(ws: WebSocket) {
    const others = this.ctx.getWebSockets().filter((s) => s !== ws)
    const left = ws.deserializeAttachment() as Mark | null
    if (left && !others.some((s) => s.deserializeAttachment() === left)) {
      const spectator = others.find((s) => s.deserializeAttachment() == null)
      if (spectator) {
        spectator.serializeAttachment(left)
        spectator.send(JSON.stringify({ type: 'joined', mark: left }))
      }
    }
    // 退出 (と昇格) を反映した席の在席を、残った全員へ知らせる
    this.broadcastPresence(others)
  }

  private broadcast() {
    const message = JSON.stringify({ type: 'state', state: this.state })
    this.ctx.getWebSockets().forEach((ws) => ws.send(message))
  }

  // 席の在席 (1P/2P が埋まっているか) を配信する。
  // 切断処理中は閉じる socket を除いた sockets を渡す。
  private broadcastPresence(sockets = this.ctx.getWebSockets()) {
    const seats = sockets.map((s) => s.deserializeAttachment() as Mark | null)
    const message = JSON.stringify({
      type: 'presence',
      seats: seatPresence(seats),
    })
    sockets.forEach((s) => s.send(message))
  }
}
