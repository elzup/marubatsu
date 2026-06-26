import { useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import type { GameState, Action, Mark } from '../../shared/game'
import type { ServerMessage } from '../../shared/messages'

// 接続ライフサイクル。盤面 (state) とは別の関心事として明示的に持つ。
export type Status = 'connecting' | 'open' | 'closed'

const toStatus = (readyState: ReadyState): Status =>
  readyState === ReadyState.OPEN
    ? 'open'
    : readyState === ReadyState.CLOSING || readyState === ReadyState.CLOSED
      ? 'closed'
      : 'connecting'

// room から ws(s)://…/ws?room=xxx を組み立てる
const wsUrl = (room: string): string => {
  const url = new URL('/ws', location.href)
  url.protocol = url.protocol.replace('http', 'ws')
  url.searchParams.set('room', room)
  return url.toString()
}

// WebSocket 接続を react-use-websocket に任せ、届いた state を「そのまま」返す hook。
//   - 接続/再接続・送受信のプリミティブはライブラリ任せ
//   - 盤面はクライアントで計算しない。受け取った state を描くだけ
//   - 接続状態は status、割り当てられた席は mark で公開する
export function useGame(room: string) {
  const [state, setState] = useState<GameState | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)

  const { sendJsonMessage, readyState } = useWebSocket(wsUrl(room), {
    shouldReconnect: () => true, // 切れたら自動で再接続
    // joined と state が連続で届くため、1 通ずつ確実に拾える onMessage で処理する。
    // (lastJsonMessage だと先着の joined が後着の state に上書きされ取りこぼす)
    onMessage: (event) => {
      const msg = JSON.parse(event.data) as ServerMessage
      if (msg.type === 'state') setState(msg.state)
      else if (msg.type === 'joined') setMark(msg.mark)
    },
  })

  // サーバへ Action を送るだけ
  const send = (action: Action) => sendJsonMessage(action)

  return { state, status: toStatus(readyState), mark, send }
}
