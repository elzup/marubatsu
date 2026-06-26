import { useState, type ReactNode } from 'react'
import { FaXmark, FaRegCircle } from 'react-icons/fa6'
import { playerLabel } from '../../shared/game'
import type {
  Mark,
  GameState,
  Action,
  SeatPresence,
} from '../../shared/types'
import { roomFromQuery } from '../../shared/room'
import { useGame, type Status } from './useGame'

// マークはテキストではなくアイコンで描く
const MARK_ICON: Record<Mark, ReactNode> = {
  X: <FaXmark className="text-rose-500" />,
  O: <FaRegCircle className="text-sky-500" />,
}

export function App() {
  // URL の ?room=xxx を初期値に。room を変えると useGame が張り直す。
  const [room, setRoom] = useState(() =>
    roomFromQuery(new URLSearchParams(location.search)),
  )

  // room 変更はユーザー操作の結果なので Effect ではなくハンドラで処理する。
  // state 更新と一緒に URL も書き換える (リンク共有で同じ部屋に入れる)。
  const changeRoom = (next: string) => {
    setRoom(next)
    const url = new URL(location.href)
    url.searchParams.set('room', next)
    history.replaceState(null, '', url)
  }

  const { state, status, mark, seats, send } = useGame(room)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 p-6 text-slate-800">
      <h1 className="text-2xl font-bold tracking-tight">マルバツ</h1>

      {/* key={room} で room 変更時に作り直し、入力欄を新しい room に初期化する */}
      <RoomBar key={room} room={room} onChange={changeRoom} />

      {/* 1P/2P が在席しているかを接続者全員に見せる (観戦者の人数は出さない) */}
      <Seats seats={seats} mark={mark} status={status} />

      <div className="flex flex-col items-center gap-5 rounded-2xl bg-white p-8 shadow-xl">
        {state ? (
          <Board state={state} mark={mark} send={send} />
        ) : (
          <p className="py-16 text-slate-400">
            {status === 'closed' ? '接続が切れました…再接続中' : '接続中…'}
          </p>
        )}
      </div>

      <SeatBadge mark={mark} status={status} />
      <p className="text-xs text-slate-400">room: {room}</p>
    </div>
  )
}

// ランダムな部屋名 (英数 6 文字)
const randomRoom = () => Math.random().toString(36).slice(2, 8)

// 入室する部屋を選ぶ最低限の UI
function RoomBar({
  room,
  onChange,
}: {
  room: string
  onChange: (room: string) => void
}) {
  const [text, setText] = useState(room)

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const next = text.trim()
        if (next) onChange(next)
      }}
    >
      <input
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="room 名"
      />
      <button
        type="submit"
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 active:scale-95"
      >
        入室
      </button>
      <button
        type="button"
        onClick={() => onChange(randomRoom())}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 active:scale-95"
      >
        ランダム
      </button>
    </form>
  )
}

// 1P(X)/2P(O) の在席を全員に見せる。観戦者の有無・人数は扱わない。
function Seats({
  seats,
  mark,
  status,
}: {
  seats: SeatPresence
  mark: Mark | null
  status: Status
}) {
  // 接続できていないうちは在席情報が当てにならないので出さない
  if (status !== 'open') return null

  const seat = (seatMark: Mark, present: boolean) => {
    const you = mark === seatMark
    const dotColor = seatMark === 'X' ? 'text-rose-500' : 'text-sky-500'
    return (
      <span className="flex items-center gap-1.5">
        <span className={present ? dotColor : 'text-slate-300'}>●</span>
        <span className="font-medium">
          {playerLabel(seatMark)} ({seatMark})
        </span>
        <span className="text-slate-400">
          {present ? (you ? 'あなた' : '在席') : '空き'}
        </span>
      </span>
    )
  }

  return (
    <div className="flex gap-5 text-xs text-slate-600">
      {seat('X', seats.X)}
      {seat('O', seats.O)}
    </div>
  )
}

function SeatBadge({ mark, status }: { mark: Mark | null; status: Status }) {
  // 未接続/接続中は席の話より先に接続状態を出す (観戦中と取り違えないため)
  if (status !== 'open') {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        {status === 'closed' ? '未接続 (再接続中)' : '接続中…'}
      </span>
    )
  }

  const style =
    mark === 'X'
      ? 'bg-rose-100 text-rose-700'
      : mark === 'O'
        ? 'bg-sky-100 text-sky-700'
        : 'bg-slate-200 text-slate-600'
  const text = mark ? `あなた: ${playerLabel(mark)} (${mark})` : '観戦中'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      {text}
    </span>
  )
}

function Board({
  state,
  mark,
  send,
}: {
  state: GameState
  mark: Mark | null
  send: (action: Action) => void
}) {
  const { board, turn, winner } = state
  const isMyTurn = mark !== null && mark === turn && !winner

  // 勝敗の表示は「自分から見て」出す。観戦者は中立に勝者を伝える。
  // (全員に「勝者: ◯◯ 🎉」を出すと、負けた側が勝ったと勘違いするため)
  const label = winner
    ? mark === winner
      ? 'あなたの勝ち 🎉'
      : mark === null
        ? `${playerLabel(winner)} (${winner}) の勝ち`
        : 'あなたの負け…'
    : board.every(Boolean)
      ? '引き分け'
      : `手番: ${playerLabel(turn)} (${turn})`

  return (
    <>
      <p className="text-lg font-medium">
        {label}
        {isMyTurn && (
          <span className="ml-2 text-sm font-semibold text-emerald-600">
            あなたの番
          </span>
        )}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {board.map((cell, i) => (
          <button
            key={i}
            disabled={!isMyTurn || Boolean(cell)}
            onClick={() => send({ type: 'move', index: i })}
            className="flex size-24 items-center justify-center rounded-xl bg-slate-50 text-5xl shadow-inner transition enabled:hover:scale-[1.03] enabled:hover:bg-slate-100 disabled:cursor-not-allowed"
          >
            {cell && MARK_ICON[cell]}
          </button>
        ))}
      </div>

      <button
        onClick={() => send({ type: 'reset' })}
        disabled={mark === null}
        className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium transition hover:bg-slate-100 active:scale-95 disabled:opacity-40"
      >
        リセット
      </button>
    </>
  )
}
