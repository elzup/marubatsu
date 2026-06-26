// 「2人が参加して 1 局を一通り進める」シナリオのテスト。
//
// サーバ実装 (server/app.ts / worker/room.ts) はどちらも
//   1. assignSeat で席を割り当て
//   2. canAct で権限を判定し
//   3. reduce で盤面を更新する
// という同じ手順を踏む。ここでは WebSocket トランスポートを抜いて
// この 3 ステップだけを再現する「最小ゲーム卓」を用意し、対局の流れを検証する。
import { describe, it, expect } from 'vitest'
import {
  createState,
  reduce,
  assignSeat,
  canAct,
  playerLabel,
  type Mark,
  type Action,
  type GameState,
} from './game'

// サーバ実装と等価な、トランスポート抜きのゲーム卓。
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
    // 着手を試みて「実際に局面が変わったか」を返す。
    // - 権限が無い (観戦者 / 手番でない) → canAct で弾いて false
    // - 権限はあるが無効な手 (埋まったマス / 決着後) → reduce が同じ state を
    //   返す (純粋・不変なので参照も同じ) ので false
    // サーバ実装では canAct を通れば reduce → broadcast まで進むが、
    // テストでは「その手が盤面を進めたか」を見たいのでこの判定にする。
    act(mark: Mark | null, action: Action): boolean {
      if (!canAct(action, mark, state)) return false
      const next = reduce(state, action)
      const changed = next !== state
      state = next
      return changed
    },
    get state(): GameState {
      return state
    },
  }
}

const move = (index: number): Action => ({ type: 'move', index })
const reset = (): Action => ({ type: 'reset' })

describe('2人が対局を一通り進めるシナリオ', () => {
  it('先着順に 1P=X / 2P=O が割り当てられ、3人目は観戦になる', () => {
    const table = createTable()

    const p1 = table.join()
    const p2 = table.join()
    const p3 = table.join()

    expect(p1).toBe('X')
    expect(p2).toBe('O')
    expect(p3).toBeNull()
    expect(playerLabel('X')).toBe('1P')
    expect(playerLabel('O')).toBe('2P')
  })

  it('交互に着手して 1P(X) が上段そろえて勝つ', () => {
    const table = createTable()
    const x = table.join() // X (1P)
    const o = table.join() // O (2P)

    // 盤面の添字
    //  0 1 2
    //  3 4 5
    //  6 7 8
    expect(table.act(x, move(0))).toBe(true) // X
    expect(table.act(o, move(3))).toBe(true) // O
    expect(table.act(x, move(1))).toBe(true) // X
    expect(table.act(o, move(4))).toBe(true) // O
    expect(table.act(x, move(2))).toBe(true) // X → 上段 [0,1,2] そろう

    expect(table.state.winner).toBe('X')
    // 勝利が確定したら手番は進めない (winner 側のまま)
    expect(table.state.turn).toBe('X')
    expect(table.state.board).toEqual([
      'X',
      'X',
      'X',
      'O',
      'O',
      null,
      null,
      null,
      null,
    ])
  })

  it('手番でないプレイヤー・観戦者・埋まったマスへの着手は通らない', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    const spectator = table.join() // null

    // 初手は X の番。O が先に打とうとしても拒否される
    expect(table.act(o, move(0))).toBe(false)
    // 観戦者は手番に関係なく何も打てない
    expect(table.act(spectator, move(0))).toBe(false)

    // X が正しく着手 → 手番が O に移る
    expect(table.act(x, move(0))).toBe(true)
    expect(table.state.turn).toBe('O')

    // O の番だが「埋まったマス」に打つと無効手として弾かれ (false)、
    // 盤面も手番も変わらない (O のまま)
    const before = table.state.board
    expect(table.act(o, move(0))).toBe(false)
    expect(table.state.board).toEqual(before)
    expect(table.state.turn).toBe('O')
  })

  it('決着後は両者とも着手できない', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()

    // X を上段で勝たせる
    table.act(x, move(0))
    table.act(o, move(3))
    table.act(x, move(1))
    table.act(o, move(4))
    table.act(x, move(2))
    expect(table.state.winner).toBe('X')

    // 勝者確定後、手番は X のまま。O は手番でないので拒否
    expect(table.act(o, move(5))).toBe(false)
    // X は手番だが決着済みなので無効手として弾かれ、盤面は不変
    const settled = table.state.board
    expect(table.act(x, move(5))).toBe(false)
    expect(table.state.board).toEqual(settled)
    expect(table.state.winner).toBe('X')
  })

  it('reset はどちらのプレイヤーからでも実行でき、観戦者は不可', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()
    const spectator = table.join()

    table.act(x, move(4))
    expect(table.state.board[4]).toBe('X')

    // 観戦者の reset は無視される
    expect(table.act(spectator, reset())).toBe(false)
    // 手番でない O でも reset はできる (reset は手番に依らない)
    expect(table.act(o, reset())).toBe(true)
    expect(table.state).toEqual(createState())
  })

  it('勝者が出ないまま全マス埋まり引き分けで終局する', () => {
    const table = createTable()
    const x = table.join()
    const o = table.join()

    // 途中で 3 つそろわない順序で全マスを埋める
    //  X O X
    //  X O O
    //  O X X
    const sequence: ReadonlyArray<[Mark | null, number]> = [
      [x, 0],
      [o, 1],
      [x, 2],
      [o, 4],
      [x, 3],
      [o, 5],
      [x, 7],
      [o, 6],
      [x, 8],
    ]
    for (const [mark, index] of sequence) {
      expect(table.act(mark, move(index))).toBe(true)
    }

    expect(table.state.winner).toBeNull()
    expect(table.state.board.every((cell) => cell !== null)).toBe(true)
  })
})
