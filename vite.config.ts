import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** 仅开发模式需要的 HMR WebSocket 来源（生产构建移除，PLAN 3.8 / QA P2-4） */
const DEV_WS_CONNECT_SRC = ' ws://localhost:* ws://127.0.0.1:*'
/** index.html CSP 中的占位符，dev 注入 ws 白名单，build 替换为空串 */
const CSP_DEV_WS_PLACEHOLDER = '__CSP_DEV_WS__'

function conditionalCspPlugin(): Plugin {
  return {
    name: 'deepsearch:conditional-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const devWs = context.server ? DEV_WS_CONNECT_SRC : ''
        return html.split(CSP_DEV_WS_PLACEHOLDER).join(devWs)
      },
    },
  }
}

/**
 * 单文件构建 + 开发 Key 注入。
 *
 * - 开发模式（vite serve）从 `.env` 读取 DEEPSEEK_API_KEY，注入 `__DEV_API_KEY__`。
 * - 生产构建（vite build，mode = production）注入空字符串，真实 Key 永不进入 dist。
 * - `.env` 不参与 import，仅通过 define 字符串替换注入；构建产物不含其它环境变量。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiKey = mode === 'development' ? (env.DEEPSEEK_API_KEY ?? '').trim() : ''

  return {
    base: './',
    plugins: [vue(), conditionalCspPlugin(), viteSingleFile()],
    define: {
      __DEV_API_KEY__: JSON.stringify(devApiKey),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      sourcemap: false,
      assetsInlineLimit: 100_000_000,
      chunkSizeWarningLimit: 2000,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
  }
})
