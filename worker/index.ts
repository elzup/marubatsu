// Cloudflare Worker のエントリ。
// /ws へのアクセスは「ルーム名」ごとの Durable Object に振り分け、
// それ以外は React のビルド成果物 (静的アセット) を返す。
import { RoomDO } from './room'

export interface Env {
  ROOM: DurableObjectNamespace
  ASSETS: Fetcher
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/ws') {
      const roomName = url.searchParams.get('room') || 'lobby'
      // 同じルーム名 → 必ず同じ DO インスタンス (= 同じ盤面) に届く
      const id = env.ROOM.idFromName(roomName)
      const stub = env.ROOM.get(id)
      return stub.fetch(request)
    }

    // 静的アセット (web/dist)
    return env.ASSETS.fetch(request)
  },
}

export { RoomDO }
