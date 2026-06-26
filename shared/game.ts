// ゲームの「純粋ロジック」。サーバ (Render / Cloudflare) もクライアントも、
// ここだけを共有して使う。DOM も WebSocket も Node も一切知らない。
//
// 設計の肝: すべての state 更新を reduce() の 1 関数に集約する。
// 「今の state」と「やりたいこと (Action)」を渡すと「次の state」が返る。これだけ。
//
// 型は messages.ts (Zod スキーマ) を正準とし、ここから取り込む。
import type { Mark, Cell, GameState, Action } from './messages'

export type { Mark, Cell, GameState, Action }

export const createState = (): GameState => ({
  board: Array(9).fill(null),
  turn: 'X',
  winner: null,
})

// 席 = プレイヤーのマーク。X が 1P、O が 2P。
export const SEATS: readonly Mark[] = ['X', 'O']

// 空いている席を先着で割り当てる。両方埋まっていれば null (観戦)。
export const assignSeat = (taken: readonly (Mark | null)[]): Mark | null =>
  SEATS.find((seat) => !taken.includes(seat)) ?? null

// X→1P / O→2P の表示名
export const playerLabel = (mark: Mark): string => (mark === 'X' ? '1P' : '2P')

// その Action を実行してよいか (権限判定)。観戦者(null)は何もできない。
// move は手番のプレイヤーだけ、reset はどちらのプレイヤーでも可。
export const canAct = (
  action: Action,
  mark: Mark | null,
  state: GameState,
): boolean => mark !== null && (action.type === 'reset' || mark === state.turn)

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
export const reduce = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'reset':
      return createState()

    case 'move': {
      const { index } = action
      // 決着済み or 埋まっているマスは無視 (state を変えず同じ参照を返す)
      if (state.winner || state.board[index]) return state

      const board = state.board.map((cell, i) =>
        i === index ? state.turn : cell,
      )
      const winner = calcWinner(board)
      const turn = winner ? state.turn : state.turn === 'X' ? 'O' : 'X'
      return { board, turn, winner }
    }

    default:
      return state
  }
}
