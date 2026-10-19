#!/usr/bin/env node
/**
 * dist 单文件构建校验（无第三方依赖）。
 *
 * 断言：
 * 1. `dist/` 中只有 `index.html`（不允许任何其它文件）；
 * 2. 不含外链脚本（`<script src>`）与外链样式（`<link rel="stylesheet">`）；
 * 3. 包含 API 基址 `api.deepseek.com`；
 * 4. 不包含 `.env` 中的真实 `DEEPSEEK_API_KEY`；
 * 5. 不包含 `sk-` 形式的真实 API Key（占位符 `sk-...` 允许）；
 * 6. 体积小于 2 MB。
 *
 * 失败时以非零状态码退出，并输出不含敏感值的诊断信息。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = join(ROOT, 'dist')
const INDEX_FILE = join(DIST_DIR, 'index.html')
const ENV_FILE = join(ROOT, '.env')
const SIZE_BUDGET = 2 * 1024 * 1024
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

/** 收集目录内全部条目（相对路径），用于“dist 只有 index.html”断言 */
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

function checkDistEntries() {
  let entries
  try {
    entries = listEntries(DIST_DIR)
  } catch {
    fail('dist/ 不存在或不可读，请先运行 npm run build')
    return false
  }
  if (entries.length === 1 && entries[0].path === 'index.html') {
    pass(`dist 只包含 index.html（${entries[0].size} 字节）`)
    return true
  }
  const names = entries.map((entry) => `${entry.path} (${entry.size} 字节)`).join(', ')
  fail(`dist 应只包含 index.html，实际：${names}`)
  return false
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

function checkHtml() {
  let html
  try {
    html = readFileSync(INDEX_FILE, 'utf8')
  } catch {
    fail('dist/index.html 不存在或不可读')
    return
  }

  const sizeBytes = Buffer.byteLength(html, 'utf8')
  if (sizeBytes < SIZE_BUDGET) {
    pass(`dist/index.html 体积 ${sizeBytes} 字节 < 2 MB 预算`)
  } else {
    fail(`dist/index.html 体积 ${sizeBytes} 字节，超出 2 MB 预算`)
  }

  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
    fail('dist/index.html 含外链脚本（<script src>）')
  } else {
    pass('无外链脚本（<script src>）')
  }

  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(html)) {
    fail('dist/index.html 含外链样式（<link rel="stylesheet">）')
  } else {
    pass('无外链样式（<link rel="stylesheet">）')
  }

  if (html.includes('api.deepseek.com')) {
    pass('包含 API 基址 api.deepseek.com')
  } else {
    fail('未包含 API 基址 api.deepseek.com')
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

console.log('DeepSearch 单文件构建校验')
console.log(`目标：${INDEX_FILE}`)
console.log('')

const hasOutput = checkDistEntries()
if (hasOutput) checkHtml()

console.log('')
for (const message of passed) console.log(`PASS  ${message}`)
for (const message of failures) console.error(`FAIL  ${message}`)

if (failures.length > 0) {
  console.error(`\n校验失败：${failures.length} 项未通过`)
  process.exit(1)
}

console.log(`\n校验通过：${passed.length} 项断言全部满足`)
