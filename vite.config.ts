import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, transformWithEsbuild } from 'vite'
import type { Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** 仅开发模式需要的 HMR WebSocket 来源（生产构建移除，PLAN 3.8 / QA P2-4） */
const DEV_WS_CONNECT_SRC = ' ws://localhost:* ws://127.0.0.1:*'
/** index.html CSP 中的占位符，dev 注入 ws 白名单，build 替换为空串 */
const CSP_DEV_WS_PLACEHOLDER = '__CSP_DEV_WS__'
/** HTML 压缩期间存放 script/style 体内内容的占位符前缀 */
const BLOCK_SLOT = '@@DS_BLOCK_'

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
 * 压缩单文件 HTML。
 *
 * Vite 只压缩 rollup 产出的 chunk，`index.html` 中手写的内联脚本与 HTML 骨架原样输出。
 * 这里把 script/style 体内内容移出（避免压缩破坏代码与字符串），对内联脚本用与构建
 * 相同的压缩器处理，其余部分移除 HTML 注释并折叠标签间空白。
 */
async function minifyHtml(html: string): Promise<string> {
  const blocks: string[] = []
  let output = ''
  let cursor = 0
  const pattern = /<(script|style)([^>]*)>([\s\S]*?)<\/\1>/gi

  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    output += html.slice(cursor, match.index)
    cursor = match.index + match[0].length

    const tag = match[1].toLowerCase()
    const attrs = match[2]
    const body = match[3].trim()
    if (!body) {
      output += match[0]
      continue
    }

    let content = body
    // module chunk 已由 Vite 压缩，只有 head 中手写的内联脚本需要处理
    const isModuleChunk = tag === 'script' && /\btype\s*=\s*["']module["']/.test(attrs)
    if (tag === 'script' && !isModuleChunk) {
      const minified = await transformWithEsbuild(body, 'inline-script.js', {
        minify: true,
        target: 'es2022',
        legalComments: 'none',
      })
      content = minified.code
    }

    output += `<${tag}${attrs}>${BLOCK_SLOT}${blocks.length}@@</${tag}>`
    blocks.push(content)
  }
  output += html.slice(cursor)

  const compacted = output
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return compacted.replace(
    new RegExp(`${BLOCK_SLOT}(\\d+)@@`, 'g'),
    (_, index: string) => blocks[Number(index)] ?? '',
  )
}

/** 构建结束后压缩 `dist/index.html`：只作用于产物，开发模式保持源码可读 */
function minifyHtmlPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'deepsearch:minify-html',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      const file = resolve(process.cwd(), outDir, 'index.html')
      let html: string
      try {
        html = readFileSync(file, 'utf8')
      } catch {
        return
      }
      writeFileSync(file, await minifyHtml(html))
    },
  }
}

/**
 * 单文件构建 + 开发 Key 注入。
 *
 * - 开发模式（vite serve）从 `.env` 读取 DEEPSEEK_API_KEY，注入 `__DEV_API_KEY__`。
 * - 生产构建（vite build，mode = production）注入空字符串，真实 Key 永不进入 dist。
 * - `.env` 不参与 import，仅通过 define 字符串替换注入；构建产物不含其它环境变量。
 * - 全部组件使用 `<script setup>`，关闭 Vue 的 Options API 运行时以减小产物体积。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiKey = mode === 'development' ? (env.DEEPSEEK_API_KEY ?? '').trim() : ''

  return {
    base: './',
    plugins: [vue(), conditionalCspPlugin(), viteSingleFile(), minifyHtmlPlugin()],
    define: {
      __DEV_API_KEY__: JSON.stringify(devApiKey),
      __VUE_OPTIONS_API__: 'false',
      __VUE_PROD_DEVTOOLS__: 'false',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist',
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
