import { useEffect, useRef, useState } from 'react'
import type { GameState, Action } from '../../shared/game'

// WebSocket につなぎ、サーバから届いた最新 state を「そのまま」返す hook。
//
// 理想形: クライアントは盤面を計算しない。
//   - 受け取った state を画面に描くだけ (state)
//   - やりたいことは Action にして送るだけ (send)
export function useGame(room: string) {
  const [state, setState] = useState<GameState | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // http(s)://… を ws(s)://… に変えて /ws につなぐ
    const url = location.origin.replace(/^http/, 'ws') + `/ws?room=${room}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'state') setState(msg.state)
    }

    return () => ws.close() // 部屋を変えた / 離れたら切断
  }, [room])

  // サーバへ Action を送るだけ
  const send = (action: Action) => {
    wsRef.current?.send(JSON.stringify(action))
  }

  return { state, send }
}
