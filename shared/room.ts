// ルーム名の解決。サーバ (Render / Cloudflare) もクライアントも、
// クエリ文字列からの取り出し方をここに一本化する。

export const DEFAULT_ROOM = 'lobby'

// ?room=xxx を取り出す。無ければ既定ルームへ。
export const roomFromQuery = (params: URLSearchParams): string =>
  params.get('room') || DEFAULT_ROOM
