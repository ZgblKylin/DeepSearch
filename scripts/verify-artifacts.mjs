#!/usr/bin/env node
/**
 * dist 构建产物校验（无第三方依赖）。
 *
 * 断言：
 * 1. `dist/index.html` 存在且样式表已内联（无 `<link rel="stylesheet">`，含 `<style>`）；
 * 2. 保留首屏骨架（`boot-skeleton`），缺失会退化 FCP；
 * 3. 入口 module 脚本与 `modulepreload` 引用的文件真实存在；
 * 4. `assets/` 只含脚本，样式表已内联不留下冗余文件；
 * 5. 包含 API 基址 `api.deepseek.com`，并保留连接预热与首屏搜索预取脚本；
 * 6. 不包含 `.env` 中的真实 `DEEPSEEK_API_KEY`，也没有 `sk-` 形式的疑似 Key；
 * 7. 首屏脚本（入口 + 预加载）体积在预算内，dist 总体积小于 2 MB；
 * 8. Cloudflare 部署配置 `_headers` 随产物输出。
 *
 * 失败时以非零状态码退出，并输出不含敏感值的诊断信息。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = join(ROOT, 'dist')
const INDEX_FILE = join(DIST_DIR, 'index.html')
const ENV_FILE = join(ROOT, '.env')
const TOTAL_BUDGET = 2 * 1024 * 1024
/** 首屏脚本预算：入口应用代码 + Vue 运行时，超出说明拆包失效 */
const FIRST_SCREEN_BUDGET = 200 * 1024
/** 真实 Key 形态：sk- 后至少 20 位字母数字/下划线/连字符；`sk-...` 占位符不匹配 */
const REAL_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{20,}\b/g

const failures = []
const passed = []

function pass(message) {
  passed.push(message)
}

function fail(message) {
  failures.push(message)
}

function mask(value) {
  if (value.length <= 8) return `${'*'.repeat(value.length)}（长度 ${value.length}）`
  return `${value.slice(0, 3)}${'*'.repeat(6)}（长度 ${value.length}）`
}

/**
 * 检查 HTML 中是否存在 host 精确等于 api.deepseek.com 的 http(s) URL。
 *
 * 不直接对整段 HTML 做域名子串判断，避免把 `evil.example/api.deepseek.com`
 * 之类的路径或查询参数误判为 API 基址。
 */
function hasApiBase(html) {
  const candidates = html.match(/https?:\/\/[^\s"'<>`\\]+/g) ?? []
  return candidates.some((candidate) => {
    try {
      return new URL(candidate).hostname === 'api.deepseek.com'
    } catch {
      return false
    }
  })
}

/** 收集目录内全部条目（相对路径） */
function listEntries(dir, base = '') {
  const entries = []
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name)
    const relativePath = base ? `${base}/${name}` : name
    const stat = statSync(fullPath)
    if (stat.isDirectory()) entries.push(...listEntries(fullPath, relativePath))
    else entries.push({ path: relativePath, size: stat.size })
  }
  return entries
}

/** 从 HTML 标签属性中取出满足条件的引用地址 */
function collectRefs(html, tagPattern, attrFilter) {
  const refs = []
  for (const match of html.matchAll(tagPattern)) {
    const attrs = match[1] ?? ''
    if (!attrFilter(attrs)) continue
    const href = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]
    if (href) refs.push(href)
  }
  return refs
}

/** 相对产物路径 → 磁盘路径 */
function toDiskPath(ref) {
  return join(DIST_DIR, ref.replace(/^\.?\//, ''))
}

function readEnvKey() {
  let content = ''
  try {
    content = readFileSync(ENV_FILE, 'utf8')
  } catch {
    return null
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[1].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value.trim() || null
  }
  return null
}

function checkDistEntries() {
  let entries
  try {
    entries = listEntries(DIST_DIR)
  } catch {
    fail('dist/ 不存在或不可读，请先运行 npm run build')
    return false
  }
  if (!entries.some((entry) => entry.path === 'index.html')) {
    fail('dist 缺少 index.html')
    return false
  }
  const total = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (total < TOTAL_BUDGET) {
    pass(`dist 体积 ${total} 字节 < 2 MB 预算（${entries.length} 个文件）`)
  } else {
    fail(`dist 体积 ${total} 字节，超出 2 MB 预算`)
  }

  const strayStyles = entries.filter((entry) => entry.path.endsWith('.css'))
  if (strayStyles.length === 0) {
    pass('assets 无冗余样式表（已内联到 index.html）')
  } else {
    fail(`assets 残留样式表：${strayStyles.map((entry) => entry.path).join(', ')}`)
  }

  if (existsSync(join(DIST_DIR, '_headers'))) {
    pass('输出 Cloudflare 部署配置 _headers')
  } else {
    fail('缺少 _headers（Cloudflare 缓存策略）')
  }
  return true
}

function checkHtml() {
  let html
  try {
    html = readFileSync(INDEX_FILE, 'utf8')
  } catch {
    fail('dist/index.html 不存在或不可读')
    return
  }

  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(html)) {
    fail('dist/index.html 含外链样式（<link rel="stylesheet">），应已内联')
  } else {
    pass('无外链样式，样式表已内联')
  }

  if (/<style\b[^>]*>[\s\S]{200,}<\/style>/i.test(html)) {
    pass('存在内联样式块')
  } else {
    fail('未找到内联样式块')
  }

  if (/class="boot-home__title"[^>]*>[^<]+</.test(html)) {
    pass('首屏骨架含真实文本（参与 FCP/LCP 统计）')
  } else {
    fail('首屏骨架缺少真实文本，纯色块不会触发 FCP')
  }

  const entryScripts = collectRefs(
    html,
    /<script\b([^>]*)>/gi,
    (attrs) => /\btype\s*=\s*["']module["']/i.test(attrs),
  )
  const preloads = collectRefs(
    html,
    /<link\b([^>]*)>/gi,
    (attrs) => /\brel\s*=\s*["']?modulepreload/i.test(attrs),
  )

  if (entryScripts.length > 0) {
    pass(`入口 module 脚本 ${entryScripts.length} 个`)
  } else {
    fail('未找到入口 module 脚本')
  }

  if (preloads.length > 0) {
    pass(`modulepreload ${preloads.length} 个`)
  } else {
    fail('未找到 modulepreload，首屏依赖会串行加载')
  }

  const missing = [...entryScripts, ...preloads].filter((ref) => !existsSync(toDiskPath(ref)))
  if (missing.length === 0) {
    pass('入口脚本与预加载引用的文件均存在')
  } else {
    fail(`引用的产物文件缺失：${missing.join(', ')}`)
  }

  const firstScreenBytes = [...entryScripts, ...preloads]
    .map((ref) => toDiskPath(ref))
    .filter((path) => existsSync(path))
    .reduce((sum, path) => sum + statSync(path).size, 0)
  if (firstScreenBytes > 0 && firstScreenBytes < FIRST_SCREEN_BUDGET) {
    pass(`首屏脚本 ${firstScreenBytes} 字节 < 200 KB 预算`)
  } else {
    fail(`首屏脚本 ${firstScreenBytes} 字节，超出 200 KB 预算（拆包可能失效）`)
  }

  if (hasApiBase(html)) {
    pass('包含 API 基址 api.deepseek.com')
  } else {
    fail('未包含 API 基址 api.deepseek.com')
  }

  if (/<link\b[^>]*\brel\s*=\s*["']?preconnect/i.test(html)) {
    pass('保留 API 基址连接预热（<link rel="preconnect">）')
  } else {
    fail('缺少 API 基址连接预热（<link rel="preconnect">）')
  }

  if (html.includes('__DS_SEARCH_PREFETCH__')) {
    pass('保留首屏搜索预取脚本（__DS_SEARCH_PREFETCH__）')
  } else {
    fail('缺少首屏搜索预取脚本（__DS_SEARCH_PREFETCH__）')
  }

  if (html.includes('__DEV_API_KEY__')) {
    fail('dist/index.html 仍包含 __DEV_API_KEY__ 占位符（应已被构建替换）')
  } else {
    pass('__DEV_API_KEY__ 占位符已被构建替换')
  }

  const envKey = readEnvKey()
  if (envKey) {
    if (html.includes(envKey)) {
      fail(`dist/index.html 包含 .env 中的真实 DEEPSEEK_API_KEY（${mask(envKey)}）`)
    } else {
      pass(`不包含 .env 中的真实 DEEPSEEK_API_KEY（已检查 ${mask(envKey)}）`)
    }
  } else {
    pass('未发现可检查的 .env Key（跳过 .env Key 比对）')
  }

  const leaked = [...new Set(html.match(REAL_KEY_PATTERN) ?? [])]
  if (leaked.length > 0) {
    fail(`dist/index.html 含疑似真实 API Key：${leaked.map(mask).join(', ')}`)
  } else {
    pass('无 sk- 形式的疑似真实 API Key')
  }
}

console.log('DeepSearch 构建产物校验')
console.log(`目标：${DIST_DIR}`)
console.log('')

if (checkDistEntries()) checkHtml()

console.log('')
for (const message of passed) console.log(`PASS  ${message}`)
for (const message of failures) console.error(`FAIL  ${message}`)

if (failures.length > 0) {
  console.error(`\n校验失败：${failures.length} 项未通过`)
  process.exit(1)
}

console.log(`\n校验通过：${passed.length} 项断言全部满足`)
