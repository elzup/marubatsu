// ゲームの「純粋ロジック」。サーバ (Render / Cloudflare) もクライアントも、
// ここだけを共有して使う。DOM も WebSocket も Node も一切知らない。
//
// 設計の肝: すべての state 更新を reduce() の 1 関数に集約する。
// 「今の state」と「やりたいこと (Action)」を渡すと「次の state」が返る。これだけ。
//
// 型は messages.ts (Zod スキーマ) を正準とし、ここから取り込む。
import type { Mark, Cell, GameState, Action } from './messages'

export type { Mark, Cell, GameState, Action }

// マスを獲得するのに必要な連打数 (綱引きゲージの閾値)。
// X が +1 / O が -1 を積み、±この値に届いた側がそのマスを取る。
export const TAPS_TO_CLAIM = 5

export const createState = (): GameState => ({
  phase: 'ready', // 両者のスタート待ちから始まる
  board: Array(9).fill(null), // 確定したマス
  meters: Array(9).fill(0), // 各マスの綱引きゲージ (正=X寄り / 負=O寄り)
  ready: { X: false, O: false }, // 各プレイヤーがスタートを押したか
  winner: null,
})

// 席 = プレイヤーのマーク。X が 1P、O が 2P。
export const SEATS: readonly Mark[] = ['X', 'O']

// 空いている席を先着で割り当てる。両方埋まっていれば null (観戦)。
export const assignSeat = (taken: readonly (Mark | null)[]): Mark | null =>
  SEATS.find((seat) => !taken.includes(seat)) ?? null

// 席の在席状況。接続中の席リスト (観戦者は null) から 1P(X)/2P(O) の埋まりを出す。
// 観戦者の有無や人数は含めない。server / worker で共有し全員へ配信する。
export type SeatPresence = { X: boolean; O: boolean }
export const seatPresence = (
  seats: readonly (Mark | null)[],
): SeatPresence => ({
  X: seats.includes('X'),
  O: seats.includes('O'),
})

// X→1P / O→2P の表示名
export const playerLabel = (mark: Mark): string => (mark === 'X' ? '1P' : '2P')

// その Action を実行してよいか (権限判定)。観戦者(null)は何もできない。
// speed はターンが無いので「誰の番か」は見ず、フェーズだけで判定する。
//   reset … いつでも可 / ready … スタート待ち中のみ / tap … 対戦中のみ
export const canAct = (
  action: Action,
  mark: Mark | null,
  state: GameState,
): boolean => {
  if (mark === null) return false
  switch (action.type) {
    case 'reset':
      return true
    case 'ready':
      return state.phase === 'ready'
    case 'tap':
      return state.phase === 'playing'
    default:
      return false
  }
}

const WIN_LINES = [
  [0, 1, 2], // 横 3 列
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6], // 縦 3 列
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8], // 斜め 2 列
  [2, 4, 6],
]

const calcWinner = (board: Cell[]): Mark | null => {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

// すべての state 更新はこの 1 関数に集約する (純粋・不変)。
// 元の state は書き換えず、必ず新しいオブジェクトを返す。
// by = その操作をしたプレイヤーのマーク (server が socket の席から渡す)。
export const reduce = (
  state: GameState,
  action: Action,
  by: Mark,
): GameState => {
  switch (action.type) {
    case 'reset':
      return createState()

    case 'ready': {
      // スタート待ち中のみ。両者が押した瞬間に playing へ = 同時スタート。
      if (state.phase !== 'ready') return state
      const ready = { ...state.ready, [by]: true }
      const phase = ready.X && ready.O ? 'playing' : 'ready'
      return { ...state, ready, phase }
    }

    case 'tap': {
      if (state.phase !== 'playing') return state
      const { index } = action
      // 既に確定したマスは触れない (state を変えず同じ参照を返す)
      if (state.board[index]) return state

      // 綱引き: X は +1 / O は -1 を積む。±閾値に届いた側がマスを獲得。
      const value = state.meters[index] + (by === 'X' ? 1 : -1)
      const claimed: Mark | null =
        value >= TAPS_TO_CLAIM ? 'X' : value <= -TAPS_TO_CLAIM ? 'O' : null

      const meters = state.meters.map((m, i) => (i === index ? value : m))
      const board = claimed
        ? state.board.map((cell, i) => (i === index ? claimed : cell))
        : state.board
      const winner = claimed ? calcWinner(board) : null
      // 勝者が出る or 全マス埋まり (引き分け) で決着
      const phase = winner || board.every(Boolean) ? 'finished' : 'playing'
      return { ...state, board, meters, winner, phase }
    }

    default:
      return state
  }
}
