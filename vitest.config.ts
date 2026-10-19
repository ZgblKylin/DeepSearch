import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    // 测试环境不注入真实 Key
    __DEV_API_KEY__: JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    restoreMocks: true,
    // threads 池在受限环境（如本机 DSH 沙箱）也能运行；普通环境同样适用。
    pool: 'threads',
  },
})
