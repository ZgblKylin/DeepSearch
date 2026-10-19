/**
 * 搜索语法解析、序列化与校验（PLAN 3.4）。
 *
 * 设计要点：
 * - `q` 是唯一事实来源：筛选栏从 `q` 解析，应用筛选后重新序列化写回 `q`；
 * - 解析器不丢弃无法识别的文本：普通文本与 malformed token 都进入 `oriQuestion`，
 *   保证「解析 → 改写 → 序列化」不会静默丢失用户输入；
 * - 结构化筛选项只包含无法用纯文本表达的语法：site / -site / 短语 / 排除词 / lang / 日期。
 *
 * 支持的语法：
 *
 * ```text
 * site:a.com              包含站点
 * site:a OR site:b        包含多个站点（OR 连接）
 * -site:a.com             排除站点
 * "精确短语"              精确短语
 * -word / -"短语"         排除关键词
 * lang:zh,en              语言
 * after:2024 / 2024-01-01 起始日期（仅年份归一化为 YYYY-01-01）
 * before:2024 / 2024-12-31 结束日期（仅年份归一化为 YYYY-12-31）
 * ```
 */

/** 单次搜索允许的最大 Unicode 字符数（按码点计数，与 JavaScript 字符串长度区分） */
export const MAX_QUERY_LENGTH = 128

/** 结构化筛选项 */
export interface QueryFilters {
  /** 包含站点（host 形式），序列化为 `site:a OR site:b` */
  sites: string[]
  /** 排除站点（host 形式），序列化为 `-site:a -site:b` */
  excludedSites: string[]
  /** 精确短语，序列化为 `"短语"` */
  phrases: string[]
  /** 排除关键词；含空白时序列化为 `-"短语"` */
  excludedWords: string[]
  /** 语言代码，小写，序列化为 `lang:zh,en` */
  langs: string[]
  /** 起始日期 `YYYY-MM-DD`；仅年份输入归一化为 `YYYY-01-01` */
  after: string | null
  /** 结束日期 `YYYY-MM-DD`；仅年份输入归一化为 `YYYY-12-31` */
  before: string | null
}

/** 解析结果 */
export interface ParsedQuery {
  /** 原始查询串 */
  raw: string
  /** 结构化筛选项 */
  filters: QueryFilters
  /**
   * 去掉语法 token 的纯文本，用于 API 的 `ori_question`。
   * 无法识别的 token 原样保留，不会丢失用户输入。
   */
  oriQuestion: string
  /** 无法识别 / 格式错误的语法 token（内容已在 `oriQuestion` 中原样保留） */
  unknownTokens: string[]
}

/** 筛选分组（筛选栏 chip 与弹层使用） */
export type FilterGroupId =
  | 'sites'
  | 'excludedSites'
  | 'phrases'
  | 'excludedWords'
  | 'langs'
  | 'date'

/** 日期边界类型 */
export type DateBound = 'after' | 'before'

/** 查询校验结果 */
export interface QueryValidation {
  /** 是否可提交搜索 */
  valid: boolean
  /** 是否为空查询 */
  empty: boolean
  /** 是否超过 128 字符 */
  tooLong: boolean
  /** 实际 Unicode 字符数（去首尾空白后按码点计数） */
  length: number
  /** 面向用户的行内提示；合法时为空串 */
  message: string
}

/* -------------------------------------------------------------------------- */
/* 基础工具                                                                    */
/* -------------------------------------------------------------------------- */

/** 创建空筛选项（每次返回新对象，避免共享可变数组） */
export function createEmptyFilters(): QueryFilters {
  return {
    sites: [],
    excludedSites: [],
    phrases: [],
    excludedWords: [],
    langs: [],
    after: null,
    before: null,
  }
}

/** 折叠所有连续空白为单个空格 */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/** 按码点计算 Unicode 字符数（emoji 等代理对按 1 个字符计） */
export function countQueryChars(value: string): number {
  return Array.from((value ?? '').trim()).length
}

/**
 * 站点 host 校验：至少包含一个点，允许 IPv4；拒绝路径、空白与中文。
 * 搜索站点的语义就是互联网域名，因此要求含点，避免把普通词误判为站点。
 */
const HOST_PATTERN = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/** 语言代码：两位主语言 + 可选子标签，例如 zh、en、zh-CN、pt-br */
const LANG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i

/** 清理 host：去空白、小写、去结尾点；非法返回空串 */
function cleanHost(value: string): string {
  const host = value.trim().toLowerCase().replace(/\.+$/u, '')
  return HOST_PATTERN.test(host) ? host : ''
}

/**
 * 站点输入归一化：去掉协议、路径、查询串、端口、用户信息，只保留 host。
 *
 * 例如 `https://www.Example.com:8080/path?q=1` → `www.example.com`。
 * 无法归一化时返回空串（调用方按 malformed token 处理）。
 */
export function normalizeSite(input: string): string {
  let value = input.trim()
  if (!value) return ''
  // 去掉包裹的引号，兼容 site:"a.com"
  value = value.replace(/^"(.*)"$/u, '$1').trim()
  if (!value) return ''

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  try {
    const url = new URL(hasScheme ? value : `http://${value}`)
    if (url.hostname) return cleanHost(url.hostname)
  } catch {
    // 解析失败时按无协议的“host + 路径”手工降级
  }

  const withoutScheme = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const hostPart = withoutScheme.split(/[/?#]/u, 1)[0] ?? ''
  return cleanHost(hostPart)
}

/** 语言代码归一化；非法返回空串 */
function normalizeLang(value: string): string {
  const lang = value.trim().toLowerCase()
  return LANG_PATTERN.test(lang) ? lang : ''
}

/** 判断年份是否在合理范围（4 位数字，1000–9999） */
function isValidYear(year: number): boolean {
  return year >= 1000 && year <= 9999
}

/** 判断 `YYYY-MM-DD` 是否为真实存在的日历日期 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!isValidYear(year) || month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * 日期值归一化（PLAN 3.4：仅年份归一化）。
 * - `after:2024` → `2024-01-01`
 * - `before:2024` → `2024-12-31`
 * - `after:2024-05-06` → 原样保留
 *
 * 非法日期返回 `null`（调用方按 malformed token 处理）。
 */
export function normalizeDateValue(value: string, bound: DateBound): string | null {
  const raw = value.trim().replace(/^"(.*)"$/u, '$1').trim()
  if (!raw) return null

  const yearOnly = /^(\d{4})$/u.exec(raw)
  if (yearOnly) {
    const year = Number(yearOnly[1])
    if (!isValidYear(year)) return null
    return bound === 'after' ? `${yearOnly[1]}-01-01` : `${yearOnly[1]}-12-31`
  }

  const fullDate = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw)
  if (!fullDate) return null
  const year = Number(fullDate[1])
  const month = Number(fullDate[2])
  const day = Number(fullDate[3])
  if (!isValidCalendarDate(year, month, day)) return null
  return `${fullDate[1]}-${fullDate[2]}-${fullDate[3]}`
}

/** 日期区间是否合法（开始日期不晚于结束日期；任一端为空视为合法） */
export function isDateRangeValid(after: string | null, before: string | null): boolean {
  if (!after || !before) return true
  return after <= before
}

/* -------------------------------------------------------------------------- */
/* 词法分析                                                                    */
/* -------------------------------------------------------------------------- */

type TokenKind =
  | 'word'
  | 'phrase'
  | 'excluded-word'
  | 'site'
  | 'excluded-site'
  | 'lang'
  | 'after'
  | 'before'
  | 'unknown'

interface Token {
  kind: TokenKind
  /** 原始 token 文本（含引号/连字符），用于原样保留 malformed token */
  raw: string
  /** 归一化后的值；word 的 value 等于 raw */
  value: string
}

/** 判断 token 是否是站点之间的 OR 连接词 */
function isOrConnector(value: string): boolean {
  return value === 'OR' || value === 'or' || value === 'Or'
}

/** 去掉值两端包裹的引号（site:"a.com" / lang:"zh" 等） */
function stripWrappingQuotes(value: string): string {
  return value.replace(/^"(.*)"$/u, '$1')
}

/** 把单个普通 token 归类为语法 token / 纯文本 token */
function classifyToken(raw: string): Token {
  const lower = raw.toLowerCase()

  if (lower.startsWith('-site:')) {
    const host = normalizeSite(raw.slice('-site:'.length))
    return host
      ? { kind: 'excluded-site', raw, value: host }
      : { kind: 'unknown', raw, value: raw }
  }

  if (lower.startsWith('site:')) {
    const host = normalizeSite(raw.slice('site:'.length))
    return host ? { kind: 'site', raw, value: host } : { kind: 'unknown', raw, value: raw }
  }

  if (lower.startsWith('lang:')) {
    const langs = stripWrappingQuotes(raw.slice('lang:'.length))
      .split(',')
      .map((item) => normalizeLang(item))
      .filter((item) => item !== '')
    return langs.length > 0
      ? { kind: 'lang', raw, value: Array.from(new Set(langs)).join(',') }
      : { kind: 'unknown', raw, value: raw }
  }

  if (lower.startsWith('after:') || lower.startsWith('before:')) {
    const bound: DateBound = lower.startsWith('after:') ? 'after' : 'before'
    const prefixLength = bound === 'after' ? 'after:'.length : 'before:'.length
    const date = normalizeDateValue(raw.slice(prefixLength), bound)
    return date ? { kind: bound, raw, value: date } : { kind: 'unknown', raw, value: raw }
  }

  if (raw.startsWith('-')) {
    const value = raw.slice(1).trim()
    return value ? { kind: 'excluded-word', raw, value } : { kind: 'unknown', raw, value: raw }
  }

  return { kind: 'word', raw, value: raw }
}

/**
 * 词法分析：
 * - 空白分隔 token；
 * - 双引号包裹的短语视为一个 token；
 * - `-"..."` 视为排除短语 token；
 * - 未闭合的引号从起点吃到字符串末尾，整体作为 malformed token。
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  const length = input.length
  let index = 0

  const pushMalformedRemainder = (start: number): void => {
    const raw = input.slice(start).trim()
    if (raw) tokens.push({ kind: 'unknown', raw, value: raw })
    index = length
  }

  while (index < length) {
    const char = input[index]
    if (/\s/u.test(char)) {
      index += 1
      continue
    }

    const start = index

    // "精确短语"
    if (char === '"') {
      const end = input.indexOf('"', index + 1)
      if (end === -1) {
        pushMalformedRemainder(start)
        break
      }
      const raw = input.slice(start, end + 1)
      const value = input.slice(index + 1, end)
      // 空短语（""）属于 malformed token，原样保留
      tokens.push(value.trim() ? { kind: 'phrase', raw, value } : { kind: 'unknown', raw, value: raw })
      index = end + 1
      continue
    }

    // -"排除短语"
    if (char === '-' && input[index + 1] === '"') {
      const end = input.indexOf('"', index + 2)
      if (end === -1) {
        pushMalformedRemainder(start)
        break
      }
      const raw = input.slice(start, end + 1)
      const value = input.slice(index + 2, end)
      tokens.push(
        value.trim() ? { kind: 'excluded-word', raw, value } : { kind: 'unknown', raw, value: raw },
      )
      index = end + 1
      continue
    }

    // 普通 token：读到下一个空白
    while (index < length && !/\s/u.test(input[index])) index += 1
    tokens.push(classifyToken(input.slice(start, index)))
  }

  return tokens
}

/* -------------------------------------------------------------------------- */
/* 解析                                                                        */
/* -------------------------------------------------------------------------- */

/** 去重写入（大小写不敏感，保留首次出现的原始写法） */
function addUnique(list: string[], value: string): void {
  const normalized = value.trim()
  if (!normalized) return
  const key = normalized.toLowerCase()
  if (list.some((item) => item.toLowerCase() === key)) return
  list.push(normalized)
}

/**
 * 解析搜索语法。
 *
 * 无法识别 / 格式错误的语法 token 会同时进入 `unknownTokens` 与 `oriQuestion`，
 * 保证改写成语法形式后不丢失原文。
 */
export function parseQuery(raw: string): ParsedQuery {
  const source = typeof raw === 'string' ? raw : ''
  const filters = createEmptyFilters()
  const plainParts: string[] = []
  const unknownTokens: string[] = []
  const tokens = tokenize(source)
  let index = 0

  while (index < tokens.length) {
    const token = tokens[index]

    switch (token.kind) {
      case 'phrase':
        addUnique(filters.phrases, token.value)
        break
      case 'excluded-word':
        addUnique(filters.excludedWords, token.value)
        break
      case 'site': {
        addUnique(filters.sites, token.value)
        // site:a OR site:b：把 OR 连接链上的后续站点一并纳入
        while (
          tokens[index + 1]?.kind === 'word' &&
          isOrConnector(tokens[index + 1].raw) &&
          tokens[index + 2]?.kind === 'site'
        ) {
          addUnique(filters.sites, tokens[index + 2].value)
          index += 2
        }
        break
      }
      case 'excluded-site':
        addUnique(filters.excludedSites, token.value)
        break
      case 'lang':
        for (const lang of token.value.split(',')) addUnique(filters.langs, lang)
        break
      case 'after':
        filters.after = token.value
        break
      case 'before':
        filters.before = token.value
        break
      case 'unknown':
        unknownTokens.push(token.raw)
        plainParts.push(token.raw)
        break
      default:
        plainParts.push(token.raw)
        break
    }

    index += 1
  }

  return {
    raw: source,
    filters,
    oriQuestion: collapseWhitespace(plainParts.join(' ')),
    unknownTokens,
  }
}

/** 提取 `ori_question`（去掉语法 token 的纯文本） */
export function extractOriQuestion(raw: string): string {
  return parseQuery(raw).oriQuestion
}

/* -------------------------------------------------------------------------- */
/* 序列化                                                                      */
/* -------------------------------------------------------------------------- */

/** 归一化筛选项：去空、去重、站点转 host、语言转小写、日期归一化 */
export function normalizeFilters(input: Partial<QueryFilters> | null | undefined): QueryFilters {
  const source = input ?? {}
  const filters = createEmptyFilters()

  for (const site of source.sites ?? []) {
    const host = normalizeSite(site)
    if (host) addUnique(filters.sites, host)
  }
  for (const site of source.excludedSites ?? []) {
    const host = normalizeSite(site)
    if (host) addUnique(filters.excludedSites, host)
  }
  for (const phrase of source.phrases ?? []) {
    const value = collapseWhitespace(phrase)
    if (value) addUnique(filters.phrases, value)
  }
  for (const word of source.excludedWords ?? []) {
    const value = collapseWhitespace(word)
    if (value) addUnique(filters.excludedWords, value)
  }
  for (const lang of source.langs ?? []) {
    for (const item of collapseWhitespace(lang).split(',')) {
      const normalized = normalizeLang(item)
      if (normalized) addUnique(filters.langs, normalized)
    }
  }
  filters.after = source.after ? normalizeDateValue(source.after, 'after') : null
  filters.before = source.before ? normalizeDateValue(source.before, 'before') : null
  return filters
}

/** 把精确短语写成带引号的 token（内部引号替换为空格） */
function quotePhrase(value: string): string {
  const cleaned = collapseWhitespace(value.replace(/"/gu, ' '))
  return cleaned ? `"${cleaned}"` : ''
}

/** 把排除关键词写成 `-word` 或 `-"短语"` */
function formatExcludedWord(value: string): string {
  const cleaned = collapseWhitespace(value.replace(/"/gu, ' '))
  if (!cleaned) return ''
  return /\s/u.test(cleaned) ? `-"${cleaned}"` : `-${cleaned}`
}

/** 序列化筛选项为 token 数组（不含纯文本） */
export function serializeFilters(filters: Partial<QueryFilters> | null | undefined): string[] {
  const normalized = normalizeFilters(filters)
  const parts: string[] = []

  for (const phrase of normalized.phrases) {
    const token = quotePhrase(phrase)
    if (token) parts.push(token)
  }

  if (normalized.sites.length === 1) {
    parts.push(`site:${normalized.sites[0]}`)
  } else if (normalized.sites.length > 1) {
    parts.push(normalized.sites.map((site) => `site:${site}`).join(' OR '))
  }

  for (const site of normalized.excludedSites) parts.push(`-site:${site}`)

  for (const word of normalized.excludedWords) {
    const token = formatExcludedWord(word)
    if (token) parts.push(token)
  }

  if (normalized.langs.length > 0) parts.push(`lang:${normalized.langs.join(',')}`)
  if (normalized.after) parts.push(`after:${normalized.after}`)
  if (normalized.before) parts.push(`before:${normalized.before}`)

  return parts
}

/**
 * 序列化完整查询：筛选项 token + 纯文本。
 * `text` 用于保留问题正文（通常是 `parseQuery(raw).oriQuestion`）。
 */
export function serializeQuery(
  filters: Partial<QueryFilters> | null | undefined,
  text = '',
): string {
  const parts = serializeFilters(filters)
  const remainder = collapseWhitespace(text)
  if (remainder) parts.push(remainder)
  return parts.join(' ').trim()
}

/**
 * 用新的筛选项替换旧的筛选项，保留问题正文与 malformed token，返回新的 q。
 *
 * 筛选栏“应用”时调用：`updateQueryFilters(q, { sites: ['a.com'] })`。
 */
export function updateQueryFilters(raw: string, patch: Partial<QueryFilters>): string {
  const parsed = parseQuery(raw)
  const merged: QueryFilters = {
    sites: patch.sites ?? parsed.filters.sites,
    excludedSites: patch.excludedSites ?? parsed.filters.excludedSites,
    phrases: patch.phrases ?? parsed.filters.phrases,
    excludedWords: patch.excludedWords ?? parsed.filters.excludedWords,
    langs: patch.langs ?? parsed.filters.langs,
    after: patch.after !== undefined ? patch.after : parsed.filters.after,
    before: patch.before !== undefined ? patch.before : parsed.filters.before,
  }
  return serializeQuery(merged, parsed.oriQuestion)
}

/** 清除单个筛选分组，返回新的 q（保留问题正文） */
export function clearFilterGroup(raw: string, group: FilterGroupId): string {
  switch (group) {
    case 'sites':
      return updateQueryFilters(raw, { sites: [] })
    case 'excludedSites':
      return updateQueryFilters(raw, { excludedSites: [] })
    case 'phrases':
      return updateQueryFilters(raw, { phrases: [] })
    case 'excludedWords':
      return updateQueryFilters(raw, { excludedWords: [] })
    case 'langs':
      return updateQueryFilters(raw, { langs: [] })
    default:
      return updateQueryFilters(raw, { after: null, before: null })
  }
}

/** 清除全部筛选项，只保留问题正文；结果可能为空串（此时应回首页） */
export function clearQueryFilters(raw: string): string {
  return parseQuery(raw).oriQuestion
}

/** 是否存在任何筛选项 */
export function hasActiveFilters(filters: QueryFilters): boolean {
  return countActiveFilters(filters) > 0
}

/** 筛选项总数量（用于“清除筛选”徽标计数） */
export function countActiveFilters(filters: QueryFilters): number {
  return (
    filters.sites.length +
    filters.excludedSites.length +
    filters.phrases.length +
    filters.excludedWords.length +
    filters.langs.length +
    (filters.after ? 1 : 0) +
    (filters.before ? 1 : 0)
  )
}

/* -------------------------------------------------------------------------- */
/* 校验                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 校验查询是否可提交：
 * - 空查询不可提交；
 * - 超过 128 个 Unicode 字符时返回行内提示，不发起请求。
 */
export function validateQuery(value: string): QueryValidation {
  const trimmed = (value ?? '').trim()
  const length = Array.from(trimmed).length
  if (length === 0) {
    return { valid: false, empty: true, tooLong: false, length, message: '请输入搜索内容' }
  }
  if (length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      empty: false,
      tooLong: true,
      length,
      message: `搜索内容不能超过 ${MAX_QUERY_LENGTH} 个字符（当前 ${length} 个）`,
    }
  }
  return { valid: true, empty: false, tooLong: false, length, message: '' }
}

/** 查询是否在长度限制内（空查询返回 true，长度校验之外的空值校验由调用方负责） */
export function isQueryLengthValid(value: string): boolean {
  return countQueryChars(value) <= MAX_QUERY_LENGTH
}
