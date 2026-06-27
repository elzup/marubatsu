import { useState, type ReactNode } from 'react'
import { FaXmark, FaRegCircle } from 'react-icons/fa6'
import {
  playerLabel,
  TAPS_TO_CLAIM,
  type Mark,
  type GameState,
  type Action,
  type SeatPresence,
} from '../../shared/game'
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
      <h1 className="text-2xl font-bold tracking-tight">
        スピードマルバツ
        <span className="ml-2 text-sm font-normal text-slate-400">
          連打でマスを奪え
        </span>
      </h1>

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
  // スタート待ち中は「よーいドン」の準備画面を出す
  if (state.phase === 'ready') {
    return <ReadyView mark={mark} ready={state.ready} send={send} />
  }

  const { phase, board, meters, winner } = state
  const isPlayer = mark !== null

  // 勝敗は「自分から見て」出す。観戦者には中立に勝者を伝える。
  const label = winner
    ? mark === winner
      ? 'あなたの勝ち 🎉'
      : mark === null
        ? `${playerLabel(winner)} (${winner}) の勝ち`
        : 'あなたの負け…'
    : phase === 'finished'
      ? '引き分け'
      : '連打でマスを奪え！'

  return (
    <>
      <p className="text-lg font-medium">{label}</p>

      <div className="grid grid-cols-3 gap-2">
        {board.map((cell, i) => (
          <CellButton
            key={i}
            cell={cell}
            meter={meters[i]}
            // 連打できるのは「対戦中・自分がプレイヤー・まだ取られていないマス」だけ
            disabled={!isPlayer || phase !== 'playing' || Boolean(cell)}
            onTap={() => send({ type: 'tap', index: i })}
          />
        ))}
      </div>

      {phase === 'finished' && (
        <button
          onClick={() => send({ type: 'reset' })}
          disabled={!isPlayer}
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium transition hover:bg-slate-100 active:scale-95 disabled:opacity-40"
        >
          もう一度
        </button>
      )}
    </>
  )
}

// 1 マス。連打ゲージ (綱引き) を下から伸びる帯で表し、取られたらマークを出す。
function CellButton({
  cell,
  meter,
  disabled,
  onTap,
}: {
  cell: Mark | null
  meter: number
  disabled: boolean
  onTap: () => void
}) {
  // meter は 正=X寄り / 負=O寄り。±TAPS_TO_CLAIM で満タン。
  const ratio = Math.min(Math.abs(meter) / TAPS_TO_CLAIM, 1)
  const fill = meter > 0 ? 'bg-rose-200' : meter < 0 ? 'bg-sky-200' : ''

  return (
    <button
      disabled={disabled}
      onClick={onTap}
      className="relative flex size-24 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-5xl shadow-inner transition enabled:hover:bg-slate-100 enabled:active:scale-95 disabled:cursor-not-allowed"
    >
      {!cell && ratio > 0 && (
        <span
          className={`absolute inset-x-0 bottom-0 ${fill}`}
          style={{ height: `${ratio * 100}%` }}
        />
      )}
      <span className="relative">{cell && MARK_ICON[cell]}</span>
    </button>
  )
}

// 同時スタートの準備画面。両者が「スタート」を押すと server が同時に playing へ。
function ReadyView({
  mark,
  ready,
  send,
}: {
  mark: Mark | null
  ready: { X: boolean; O: boolean }
  send: (action: Action) => void
}) {
  const youReady = mark ? ready[mark] : false

  const badge = (seatMark: Mark) => (
    <span className="flex items-center gap-1.5 text-sm">
      <span className={ready[seatMark] ? 'text-emerald-500' : 'text-slate-300'}>
        ●
      </span>
      {playerLabel(seatMark)} ({seatMark}) {ready[seatMark] ? '準備OK' : '…'}
    </span>
  )

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <p className="text-lg font-medium">スタート待ち</p>
      <div className="flex gap-5">
        {badge('X')}
        {badge('O')}
      </div>

      {mark ? (
        <button
          onClick={() => send({ type: 'ready' })}
          disabled={youReady}
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-95 disabled:bg-slate-300"
        >
          {youReady ? '相手を待っています…' : 'スタート'}
        </button>
      ) : (
        <p className="text-slate-400">観戦中</p>
      )}

      <p className="text-xs text-slate-400">両者が押すと同時に始まります</p>
    </div>
  )
}
