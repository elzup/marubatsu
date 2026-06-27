// スピードマルバツのルールのテスト。
//
// サーバ実装 (server/app.ts / worker/room.ts) はどちらも
//   1. assignSeat で席を割り当て
//   2. canAct で権限・フェーズを判定し
//   3. reduce(state, action, by) で state を更新する
// という同じ手順を踏む。ここでは WS トランスポートを抜いてこの 3 ステップだけを
// 再現する「最小ゲーム卓」を用意し、同時スタートと連打の奪い合いを検証する。
import { describe, it, expect } from 'vitest'
import {
  createState,
  reduce,
  assignSeat,
  canAct,
  playerLabel,
  seatPresence,
  TAPS_TO_CLAIM,
  type Mark,
  type Action,
  type GameState,
} from './game'

const createTable = () => {
  let state: GameState = createState()
  const seats: (Mark | null)[] = []

  return {
    // 新規参加者に先着で席を割り当てる (X=1P / O=2P / 両席埋まりは null=観戦)
    join(): Mark | null {
      const mark = assignSeat(seats)
      seats.push(mark)
      return mark
    },
    // 操作を試みて「実際に state が変わったか」を返す。
    // 観戦者 / フェーズ違い / 取られたマス等は弾かれ false。
    act(mark: Mark | null, action: Action): boolean {
      if (mark === null || !canAct(action, mark, state)) return false
      const next = reduce(state, action, mark)
      const changed = next !== state
      state = next
      return changed
    },
    get state(): GameState {
      return state
    },
  }
}

const tap = (index: number): Action => ({ type: 'tap', index })
const ready = (): Action => ({ type: 'ready' })
const reset = (): Action => ({ type: 'reset' })

// 両者スタートして playing にする
const startGame = (
  t: ReturnType<typeof createTable>,
  x: Mark | null,
  o: Mark | null,
) => {
  t.act(x, ready())
  t.act(o, ready())
}

// by が index を満タン連打して獲得する (相手の妨害が無い前提)
const claim = (
  t: ReturnType<typeof createTable>,
  by: Mark | null,
  index: number,
) => {
  for (let i = 0; i < TAPS_TO_CLAIM; i++) t.act(by, tap(index))
}

describe('席の割り当て', () => {
  it('先着順に 1P=X / 2P=O が割り当てられ、3人目は観戦になる', () => {
    const table = createTable()

    expect(table.join()).toBe('X')
    expect(table.join()).toBe('O')
    expect(table.join()).toBeNull()
    expect(playerLabel('X')).toBe('1P')
    expect(playerLabel('O')).toBe('2P')
  })
})

describe('同時スタート (ready)', () => {
  it('片方だけ ready では始まらず、両者そろって playing になる', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()

    expect(table.act(x, ready())).toBe(true)
    expect(table.state.phase).toBe('ready') // 片方だけではまだ
    expect(table.state.ready).toEqual({ X: true, O: false })

    expect(table.act(o, ready())).toBe(true)
    expect(table.state.phase).toBe('playing') // 両者そろって同時スタート
  })

  it('playing になる前は tap できない', () => {
    const table = createTable()
    const x = table.join()
    table.join()

    expect(table.act(x, tap(0))).toBe(false)
    expect(table.state.board[0]).toBeNull()
  })

  it('観戦者は ready も tap もできない', () => {
    const table = createTable()
    table.join()
    table.join()
    const spectator = table.join()

    expect(table.act(spectator, ready())).toBe(false)
  })
})

describe('連打でマスを奪い合う (綱引き)', () => {
  it('閾値ぶん連打した側がマスを獲得する', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    startGame(table, x, o)

    for (let i = 0; i < TAPS_TO_CLAIM; i++) table.act(x, tap(0))

    expect(table.state.board[0]).toBe('X')
    expect(table.state.meters[0]).toBe(TAPS_TO_CLAIM)
  })

  it('相手の連打でゲージは押し戻され、上回った側が取る', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    startGame(table, x, o)

    // X が 4・O が 4 → 綱引きは互角 (0)。まだ誰のものでもない
    for (let i = 0; i < TAPS_TO_CLAIM - 1; i++) table.act(x, tap(0))
    for (let i = 0; i < TAPS_TO_CLAIM - 1; i++) table.act(o, tap(0))
    expect(table.state.board[0]).toBeNull()
    expect(table.state.meters[0]).toBe(0)

    // そこから O が閾値ぶん連打 → O が獲得
    for (let i = 0; i < TAPS_TO_CLAIM; i++) table.act(o, tap(0))
    expect(table.state.board[0]).toBe('O')
  })

  it('取られたマスはもう連打できない', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    startGame(table, x, o)

    claim(table, x, 0)
    expect(table.state.board[0]).toBe('X')

    expect(table.act(o, tap(0))).toBe(false) // 確定済みは無効
    expect(table.state.board[0]).toBe('X')
  })
})

describe('決着', () => {
  it('3 マスそろえた側が勝ち、phase は finished になる', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    startGame(table, x, o)

    claim(table, x, 0)
    claim(table, x, 1)
    claim(table, x, 2) // 上段そろう

    expect(table.state.winner).toBe('X')
    expect(table.state.phase).toBe('finished')
  })

  it('決着後は tap できない', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    startGame(table, x, o)
    claim(table, x, 0)
    claim(table, x, 1)
    claim(table, x, 2)

    expect(table.act(o, tap(5))).toBe(false)
    expect(table.act(x, tap(5))).toBe(false)
  })

  it('勝者なしで全マス埋まると引き分け (finished・winner null)', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    startGame(table, x, o)

    //  X O X
    //  X O O
    //  O X X
    const xCells = [0, 2, 3, 7, 8]
    const oCells = [1, 4, 5, 6]
    xCells.forEach((i) => claim(table, x, i))
    oCells.forEach((i) => claim(table, o, i))

    expect(table.state.winner).toBeNull()
    expect(table.state.phase).toBe('finished')
    expect(table.state.board.every((cell) => cell !== null)).toBe(true)
  })

  it('reset はどちらのプレイヤーからでも実行でき、観戦者は不可', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    const spectator = table.join()
    startGame(table, x, o)
    claim(table, x, 4)

    expect(table.act(spectator, reset())).toBe(false)
    expect(table.act(o, reset())).toBe(true)
    expect(table.state).toEqual(createState()) // まっさらに戻る
  })
})

describe('seatPresence: 1P/2P の在席だけを表す', () => {
  it('空席は false、埋まっていれば true', () => {
    expect(seatPresence([])).toEqual({ X: false, O: false })
    expect(seatPresence(['X'])).toEqual({ X: true, O: false })
    expect(seatPresence(['X', 'O'])).toEqual({ X: true, O: true })
  })

  it('観戦者 (null) は在席に影響しない', () => {
    expect(seatPresence(['X', null, null])).toEqual({ X: true, O: false })
    expect(seatPresence([null, null])).toEqual({ X: false, O: false })
  })
})
