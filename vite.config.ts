import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// React クライアントのビルド設定。
// 成果物は web/dist に出力し、Render の express も Cloudflare の Worker も
// この dist を静的配信する。
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    // web/ の外にある shared/ を import できるように許可
    fs: { allow: ['..'] },
    // 開発中 (vite dev) は /ws を express サーバ (3001) に転送
    proxy: { '/ws': { target: 'http://localhost:3001', ws: true } },
  },
})
