import { defineConfig } from 'vitest/config'

// vite.config.ts は root を 'web' に固定しているため、テストでは別設定にする。
// vitest.config.ts があると vite.config.ts は読み込まれず、ここが正準になる。
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts'],
    environment: 'node',
  },
})
