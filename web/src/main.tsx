import { createRoot } from 'react-dom/client'
import { App } from './App'
import './style.css'

// StrictMode はあえて付けない。開発時に WebSocket が二重接続して
// 初学者が混乱しやすいため (本番では付けても問題ない)。
createRoot(document.getElementById('root')!).render(<App />)
