// ゲームの「純粋ロジック」。サーバ (Render / Cloudflare) もクライアントも、
// ここだけを共有して使う。DOM も WebSocket も Node も一切知らない。
//
// 設計の肝: すべての state 更新を reduce() の 1 関数に集約する。
// 「今の state」と「やりたいこと (Action)」を渡すと「次の state」が返る。これだけ。

export type Mark = 'X' | 'O'
export type Cell = Mark | null

export type GameState = {
  board: Cell[] // 9 マス (0〜8)
  turn: Mark // 次に打つ手番
  winner: Mark | null // 勝者 (まだなら null)
}

// クライアントがサーバへ送る「やりたいこと」
export type Action = { type: 'move'; index: number } | { type: 'reset' }

export const createState = (): GameState => ({
  board: Array(9).fill(null),
  turn: 'X',
  winner: null,
})

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
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
