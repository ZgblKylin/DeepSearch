import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, loadEnv, transformWithEsbuild } from 'vite'
import type { Plugin } from 'vite'

import { removeHtmlComments } from './scripts/html-comments'

/** 仅开发模式需要的 HMR WebSocket 来源（生产构建移除） */
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
 * 把 `<link rel="stylesheet">` 引用的样式表内联为 `<style>`，并返回已内联的文件路径。
 *
 * 引用既可能是相对 base 的 `./assets/x.css`，也可能是绝对 base 的 `/search/assets/x.css`，
 * 统一从 `assets/` 截取产物内相对路径。
 */
function inlineStylesheets(
  html: string,
  distDir: string,
): { html: string; inlined: string[] } {
  const inlined: string[] = []
  const result = html.replace(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (!href) return tag
    const assetsIndex = href.indexOf('assets/')
    const relative = assetsIndex >= 0 ? href.slice(assetsIndex) : href.replace(/^\.?\//, '')
    const path = resolve(distDir, relative)
    try {
      const css = readFileSync(path, 'utf8')
      inlined.push(path)
      return `<style>${css}</style>`
    } catch {
      return tag
    }
  })
  return { html: result, inlined }
}

/**
 * 压缩 HTML：script/style 体内内容先移出，避免折叠空白破坏代码与字符串。
 *
 * 只有 head 中手写的内联脚本需要压缩（module chunk 由 Vite 压缩），
 * `legalComments: 'none'` 同时移除注释。
 */
async function compactHtml(html: string): Promise<string> {
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

  const compacted = removeHtmlComments(output)
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return compacted.replace(
    new RegExp(`${BLOCK_SLOT}(\\d+)@@`, 'g'),
    (_, index: string) => blocks[Number(index)] ?? '',
  )
}

/**
 * 把结果页动态 chunk 的真实路径注入 HTML 的预加载占位符。
 *
 * 结果页是 `defineAsyncComponent` 动态加载，浏览器要等主 bundle 执行后才发现它；
 * 在 head 里提前 modulepreload 可以让它与主 bundle 并行下载。文件名带内容哈希，
 * 只能构建后从 `assets/` 读取，并按已注入的入口 chunk 推断 base 前缀。
 */
function injectResultsPreload(html: string, distDir: string): string {
  const placeholder = '__DS_RESULTS_CHUNK__'
  if (!html.includes(placeholder)) return html

  const entryRef = /src="([^"]*assets\/index-[^"]+\.js)"/.exec(html)?.[1]
  let resultsFile: string | undefined
  try {
    resultsFile = readdirSync(resolve(distDir, 'assets')).find(
      (name) => name.startsWith('ResultsView-') && name.endsWith('.js'),
    )
  } catch {
    resultsFile = undefined
  }

  if (!entryRef || !resultsFile) return html.split(placeholder).join('')
  return html.split(placeholder).join(entryRef.replace(/index-[^"]+\.js$/, resultsFile))
}

/**
 * 构建收尾处理 `dist/index.html`：内联首屏样式表、注入结果页预加载路径并压缩 HTML。
 *
 * 只作用于产物，开发模式保持源码可读。样式表内联让首屏少一次往返，
 * 内联后删除源样式表避免部署冗余；内联脚本压缩由 `compactHtml` 负责，
 * Vite 只压缩 rollup 产出的 chunk。
 */
function finalizeHtmlPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'deepsearch:finalize-html',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      const dir = resolve(process.cwd(), outDir)
      const file = resolve(dir, 'index.html')
      let html: string
      try {
        html = readFileSync(file, 'utf8')
      } catch {
        return
      }
      const { html: inlined, inlined: stylesheets } = inlineStylesheets(html, dir)
      const withPreload = injectResultsPreload(inlined, dir)
      writeFileSync(file, await compactHtml(withPreload))
      for (const stylesheet of stylesheets) {
        try {
          unlinkSync(stylesheet)
        } catch {
          // 删除失败不影响产物可用性
        }
      }
    },
  }
}

/**
 * 多文件构建 + 开发 Key 注入。
 *
 * - 首屏只加载 Vue、应用外壳与首页；结果页、AI 面板与设置面板按需加载；
 * - 样式合并为单个文件并在构建收尾内联，避免首屏额外往返；
 * - `DEPLOY_BASE` 指定部署路径（如 `/search/`），资源引用随之变成绝对路径，
 *   访问时不要求 URL 以 `/` 结尾；未设置时使用相对 base `./`（本地预览与根路径部署）；
 * - 开发模式（vite serve）从 `.env` 读取 DEEPSEEK_API_KEY，注入 `__DEV_API_KEY__`；
 *   生产构建注入空字符串，真实 Key 永不进入 dist；
 * - 全部组件使用 `<script setup>`，关闭 Vue 的 Options API 运行时以减小体积。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiKey = mode === 'development' ? (env.DEEPSEEK_API_KEY ?? '').trim() : ''
  const deployBase = process.env.DEPLOY_BASE?.trim() || './'

  return {
    base: deployBase,
    plugins: [
      vue(),
      conditionalCspPlugin(),
      finalizeHtmlPlugin(),
      // 构建后生成依赖占比报告，用于定位异常膨胀；输出在 .report/ 且不参与部署
      visualizer({
        filename: '.report/bundle.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
    ],
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
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue'],
            markdown: ['marked', 'dompurify'],
          },
        },
      },
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
