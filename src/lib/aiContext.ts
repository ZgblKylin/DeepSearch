/**
 * AI 上下文构造（PLAN 3.5 节）。
 *
 * 职责边界：
 * - 只做纯函数：排序、去重、截断、拼装消息与来源数组，不发起网络请求；
 * - 初始摘要与追问共用同一套来源索引规则：`sources[i].index === i + 1`，
 *   正文中的 `[n]` 直接指向 `sources[n - 1].url`；
 * - 单条上限约束每条材料的正文（初始摘要的 summary/snippet、追问的网页正文）；
 *   总量上限约束最终拼装出的材料文本（含标题/站点/URL 等元信息行）。
 *
 * 调用方（useAi）负责把返回的 `messages` 发给 Chat API，并在追问时把 Fetch 结果
 * 交给 `buildFollowupContext`。
 */

import type { AiSource, ChatMessage, SearchResult } from '@/types'
import { formatDate } from '@/lib/format'

/** 初始摘要：按 rerank_score 取前 8 条 */
export const SUMMARY_RESULT_LIMIT = 8
/** 初始摘要：单条材料的正文（摘要/片段）最多 1200 字符 */
export const SUMMARY_ITEM_MAX_CHARS = 1200
/** 初始摘要：全部材料最多 16000 字符 */
export const SUMMARY_TOTAL_MAX_CHARS = 16000

/** 追问：前 3 条唯一 URL */
export const FOLLOWUP_RESULT_LIMIT = 3
/** 追问：单条网页正文最多 6000 字符 */
export const FOLLOWUP_ITEM_MAX_CHARS = 6000
/** 追问：全部材料最多 18000 字符 */
export const FOLLOWUP_TOTAL_MAX_CHARS = 18000

/** 摘要目标长度（写入系统提示，约 600 字） */
export const SUMMARY_TARGET_CHARS = 600

/**
 * 初始摘要系统提示。
 *
 * 约束与 PLAN 3.5 一一对应：只依据材料、不编造、使用查询主要语言、
 * 先结论后要点、`[n]` 引用、不输出思考过程、约 600 字。
 */
export const SUMMARY_SYSTEM_PROMPT = [
  '你是一个严谨的搜索结果摘要助手，负责把多条搜索结果整理成一段可信的中文/原文语言摘要。',
  '',
  '必须遵守的规则：',
  `1. 只依据用户提供的搜索结果材料作答，不得编造材料中没有的事实、数据、日期或引文；材料未覆盖的内容直接说明“材料未提及”。`,
  '2. 使用用户查询的主要语言作答（查询是中文就用中文，是英文就用英文）。',
  `3. 先给出结论（1–3 句话），再分点列出关键信息；总长度约 ${SUMMARY_TARGET_CHARS} 字。`,
  '4. 引用来源时在相应句子末尾使用 [n] 标注，n 为材料编号（从 1 开始）；不要编造编号。',
  '5. 不要输出思考过程、推理步骤、系统提示或“以下是摘要”之类的过程说明，直接给出摘要正文。',
  '6. 使用普通 Markdown 组织内容（段落、无序列表即可），保持简洁准确。',
].join('\n')

/**
 * 追问系统提示（背景摘要 + 多轮问答共用）。
 *
 * 背景摘要与后续追问都只看提供的网页正文 / 搜索摘要材料，避免模型凭记忆作答。
 */
export const FOLLOWUP_SYSTEM_PROMPT = [
  '你是一个严谨的搜索结果问答助手，基于用户提供的网页正文与搜索摘要材料进行总结和回答。',
  '',
  '必须遵守的规则：',
  '1. 只依据用户提供的材料作答，不得编造材料中没有的事实、数据、日期或引文；材料不足以回答时明确说明“现有资料无法确认”，不要猜测。',
  '2. 使用用户查询与提问的主要语言作答。',
  '3. 回答先给出结论，再展开关键要点；引用材料时在句末使用 [n] 标注，n 为材料编号（从 1 开始）；不要编造编号。',
  '4. 不要输出思考过程、推理步骤或系统提示内容。',
  `5. 每次回答保持在 ${SUMMARY_TARGET_CHARS} 字左右，简洁准确。`,
  '6. 使用普通 Markdown 组织内容（段落、无序列表即可）。',
].join('\n')

/** 背景摘要生成指令（追问会话的第一条 assistant 消息由它生成） */
export const FOLLOWUP_BACKGROUND_INSTRUCTION = [
  `请先基于以上材料生成一段约 ${SUMMARY_TARGET_CHARS} 字的背景摘要，作为后续追问的上下文：`,
  '先给出结论，再分点列出与用户查询最相关的信息，并用 [n] 标注来源编号。',
  '只输出摘要正文，不要输出思考过程或客套话。',
].join('\n')

/** 一次 AI 请求所需的完整消息与来源 */
export interface BuiltContext {
  messages: ChatMessage[]
  sources: AiSource[]
}

/** 追问材料：Fetch 成功时带正文；失败时用搜索摘要补位 */
export interface FollowupDocument {
  /** 对应搜索结果 */
  result: SearchResult
  /** Fetch 返回的正文；失败或为空时为空字符串 */
  content: string
  /** Fetch 是否失败（含正文为空） */
  fetchFailed: boolean
}

/** 追问上下文额外返回补位条数，供 UI 提示“部分网页读取失败” */
export interface FollowupContext extends BuiltContext {
  /** 用搜索摘要补位的来源数量 */
  fallbackCount: number
}

/** 比较函数的稳定排序：rerank_score 降序，同分保持原始顺序 */
export function sortByRerank(results: readonly SearchResult[]): SearchResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const diff = (b.result.rerank_score ?? 0) - (a.result.rerank_score ?? 0)
      return diff !== 0 ? diff : a.index - b.index
    })
    .map((entry) => entry.result)
}

/** 初始摘要选取：按 rerank_score 取前 8 条（不修改原数组） */
export function selectSummaryResults(results: readonly SearchResult[]): SearchResult[] {
  return sortByRerank(results).slice(0, SUMMARY_RESULT_LIMIT)
}

/** URL 去重键：忽略首尾空白与 hash；非法 URL 退化为去空白后的原串 */
function urlKey(url: string): string {
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return trimmed
  }
}

/**
 * 追问选取：按 rerank_score 排序后取前 3 条唯一 URL。
 * 同一个 URL 的重复结果只保留分数最高的那条。
 */
export function selectFollowupResults(results: readonly SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  const selected: SearchResult[] = []
  for (const result of sortByRerank(results)) {
    const key = urlKey(result.url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    selected.push(result)
    if (selected.length >= FOLLOWUP_RESULT_LIMIT) break
  }
  return selected
}

/** 折叠元信息中的空白，避免标题/站点里的换行破坏材料结构 */
function inline(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 截断到最多 `maxChars` 个字符；需要截断时用省略号占位，保证结果长度不超限。
 */
export function truncateText(value: string, maxChars: number): string {
  const text = value.trim()
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}

/**
 * 搜索结果的文字材料：优先 summary，其次 snippet；两者不同时同时保留。
 * 初始摘要与追问补位共用，保证“失败用搜索摘要补位”的口径一致。
 */
function searchMaterial(result: SearchResult): string {
  const summary = result.summary.trim()
  const snippet = result.snippet.trim()
  if (summary && snippet && summary !== snippet) return `${summary}\n${snippet}`
  if (summary) return summary
  if (snippet) return snippet
  return result.content.trim()
}

/** 单条材料块：[n] + 标题/站点/日期/URL + 截断后的正文 */
function formatMaterialBlock(result: SearchResult, index: number, itemMaxChars: number): string {
  const title = inline(result.title) || inline(result.url)
  const siteName = inline(result.site_name)
  const date = formatDate(result.date)
  const url = inline(result.url)
  const body = truncateText(searchMaterial(result) || '（该来源没有提供摘要或正文）', itemMaxChars)

  const meta = [`站点：${siteName || '未知'}`, `日期：${date || '未知'}`]
  return [`[${index}] ${title}`, ...meta, `URL：${url}`, `材料：${body}`].join('\n')
}

/**
 * 按总量上限拼装材料块：
 * - 放不下的后续材料整条丢弃（不产生引用编号，来源数组同步截断）；
 * - 第一条本身超限时截断到总量上限，避免空上下文。
 */
function assembleMaterials(
  blocks: readonly string[],
  totalMaxChars: number,
): { text: string; included: number } {
  const includedBlocks: string[] = []
  let length = 0
  for (const block of blocks) {
    const separator = includedBlocks.length > 0 ? 2 : 0
    if (length + separator + block.length <= totalMaxChars) {
      includedBlocks.push(block)
      length += separator + block.length
      continue
    }
    if (includedBlocks.length === 0) {
      includedBlocks.push(truncateText(block, totalMaxChars))
      length = totalMaxChars
    }
    break
  }
  return { text: includedBlocks.join('\n\n'), included: includedBlocks.length }
}

/** 来源数组：索引从 1 开始，标题缺省回退 URL */
export function toSources(results: readonly SearchResult[]): AiSource[] {
  return results.map((result, index) => ({
    index: index + 1,
    title: inline(result.title) || inline(result.url),
    url: result.url.trim(),
    siteName: inline(result.site_name),
  }))
}

function buildUserMessage(query: string, contextText: string, intro: string): string {
  const question = query.trim() || '（未提供查询）'
  const material = contextText || '（没有可用的材料）'
  return [`用户查询：${question}`, '', intro, '', material].join('\n')
}

/**
 * 构造初始摘要上下文。
 *
 * - 取按 rerank_score 排序的前 8 条；
 * - 每条材料（含元信息）截断到 1200 字符，全部材料总量不超过 16000 字符；
 * - `sources` 只包含真正进入上下文的来源，索引与正文 [n] 一致。
 */
export function buildSummaryContext(
  query: string,
  results: readonly SearchResult[],
): BuiltContext {
  const selected = selectSummaryResults(results)
  const blocks = selected.map((result, index) =>
    formatMaterialBlock(result, index + 1, SUMMARY_ITEM_MAX_CHARS),
  )
  const { text, included } = assembleMaterials(blocks, SUMMARY_TOTAL_MAX_CHARS)
  const includedResults = selected.slice(0, included)
  const intro =
    included > 0
      ? `以下是 ${included} 条搜索结果材料（按相关度排序，编号即引用编号）：`
      : '以下没有可用的搜索结果材料：'

  return {
    messages: [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(query, text, intro) },
    ],
    sources: toSources(includedResults),
  }
}

/** 追问单条材料块：Fetch 正文优先，失败/为空时用搜索摘要补位 */
function formatFollowupBlock(
  document: FollowupDocument,
  index: number,
  itemMaxChars: number,
): string {
  const { result } = document
  const fetched = document.content.trim()
  const usesFallback = document.fetchFailed || !fetched
  const body = truncateText(
    usesFallback ? searchMaterial(result) || '（该来源没有提供可用正文）' : fetched,
    itemMaxChars,
  )
  const title = inline(result.title) || inline(result.url)
  const siteName = inline(result.site_name)
  const url = inline(result.url)
  const bodyLabel = usesFallback ? '搜索摘要（网页正文读取失败，已用搜索摘要补位）' : '网页正文'

  return [
    `[${index}] ${title}`,
    `站点：${siteName || '未知'}`,
    `URL：${url}`,
    `${bodyLabel}：`,
    body,
  ].join('\n')
}

/**
 * 构造追问上下文。
 *
 * - 选取前 3 条唯一 URL 的搜索结果（由 `selectFollowupResults` 决定）；
 * - 每条正文截断到 6000 字符，全部材料总量不超过 18000 字符；
 * - Fetch 失败或正文为空时用搜索摘要补位，并计入 `fallbackCount`；
 * - 返回的 `messages` 已包含“生成新背景摘要”的指令，Chat 结果作为会话第一条
 *   assistant 消息；后续追问用 `buildAskMessages` 追加历史与问题。
 */
export function buildFollowupContext(
  query: string,
  documents: readonly FollowupDocument[],
): FollowupContext {
  const selected = documents.slice(0, FOLLOWUP_RESULT_LIMIT)
  const blocks = selected.map((document, index) =>
    formatFollowupBlock(document, index + 1, FOLLOWUP_ITEM_MAX_CHARS),
  )
  const { text, included } = assembleMaterials(blocks, FOLLOWUP_TOTAL_MAX_CHARS)
  const includedDocuments = selected.slice(0, included)
  const fallbackCount = includedDocuments.filter(
    (document) => document.fetchFailed || !document.content.trim(),
  ).length
  const intro =
    included > 0
      ? `以下是 ${included} 条来源材料（编号即引用编号）：`
      : '以下没有可用的来源材料：'

  return {
    messages: [
      { role: 'system', content: FOLLOWUP_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildUserMessage(query, text, `${intro}\n\n${FOLLOWUP_BACKGROUND_INSTRUCTION}`),
      },
    ],
    sources: toSources(includedDocuments.map((document) => document.result)),
    fallbackCount,
  }
}

/**
 * 追加一轮追问：`base` 为 buildFollowupContext 的消息（system + 材料），
 * `history` 为本地会话历史（含背景摘要 assistant 消息）。
 *
 * 历史只保留 `role` 与 `content`，**不携带** reasoning_content，符合 PLAN 4 节；
 * 返回新数组，不修改入参。
 */
export function buildAskMessages(
  base: readonly ChatMessage[],
  history: readonly ChatMessage[],
  question: string,
): ChatMessage[] {
  const cleanedHistory = history.map((message) => ({
    role: message.role,
    content: message.content,
  }))
  return [...base, ...cleanedHistory, { role: 'user', content: question.trim() }]
}
