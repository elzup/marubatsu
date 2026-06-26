// このゲームで扱うデータの「形」を全部ここにまとめる。
// 以前は zod スキーマから型を導出していたが、初学者でも一目で分かるように
// 素の TypeScript の type だけで書いている。困ったらまずこのファイルを見る。

// ---- 盤面まわり ----

// マス目に置けるマーク。X が 1P、O が 2P。
export type Mark = 'X' | 'O'

// 盤面の 1 マス。まだ何も置かれていなければ null。
export type Cell = Mark | null

// 盤面は 9 マス。左上から右下へ 0〜8 の順で並ぶ。
//   0 | 1 | 2
//   3 | 4 | 5
//   6 | 7 | 8
export type Board = Cell[]

// ゲームの状態。これ 1 つで「今の局面」が完全に決まる。
// サーバはこの state を持ち、クライアントは受け取って描くだけ。
export type GameState = {
  board: Board // 9 マスの中身
  turn: Mark // 次に打つ番のプレイヤー
  winner: Mark | null // 勝者 (まだ決まっていなければ null)
}

// ---- クライアント → サーバ に送るメッセージ (Action) ----

// マスに打つ
export type MoveAction = {
  type: 'move'
  index: number // 打つマス (0〜8)
}

// 盤面を最初からやり直す
export type ResetAction = {
  type: 'reset'
}

// クライアントが送れる操作は、この 2 種類のどちらか。
export type Action = MoveAction | ResetAction

// ---- サーバ → クライアント に送るメッセージ ----

// 最新の盤面を配る
export type StateMessage = {
  type: 'state'
  state: GameState
}

// 参加したときに割り当てた席を伝える (X=1P / O=2P / null=観戦)
export type JoinedMessage = {
  type: 'joined'
  mark: Mark | null
}

// 1P(X)/2P(O) が在席しているか。観戦者の有無・人数は含めない。
export type SeatPresence = { X: boolean; O: boolean }

// 席の在席を配る (接続/切断のたびに送られる)
export type PresenceMessage = {
  type: 'presence'
  seats: SeatPresence
}

// サーバが送るメッセージは、この 3 種類のどれか。
export type ServerMessage = StateMessage | JoinedMessage | PresenceMessage
