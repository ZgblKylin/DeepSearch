/**
 * 全站共享类型与默认值。
 *
 * 这些类型是 T1 交接给 T2/T3/T4 的契约：功能团队只消费，不修改本文件。
 */

/** 主题三态：浅色 / 深色 / 跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 解析后的实际主题（写回 `data-theme`） */
export type ResolvedTheme = 'light' | 'dark'

/** 可选 AI 模型（请求体 model 字段） */
export type AiModel = 'deepseek-flash' | 'deepseek-v4-pro'

/** 思考挡位：关闭 / 低 / 高 / 最高 */
export type ReasoningEffort = 'off' | 'low' | 'high' | 'max'

/** 结果排序：相关度 / 最新 */
export type SortMode = 'relevance' | 'latest'

/** 外部搜索引擎 */
export type EngineId = 'bing' | 'google' | 'baidu' | 'duckduckgo'

/** API 请求上下文，用于错误弹窗标题与错误归因 */
export type ApiErrorContext = 'search' | 'chat' | 'fetch' | 'test'

/** AI 面板阶段 */
export type AiPhase =
  | 'idle'
  | 'summarizing'
  | 'ready'
  | 'followup-loading'
  | 'followup-ready'
  | 'error'

/** 设置项（localStorage: deepsearch.settings.v1） */
export interface Settings {
  apiKey: string
  aiModel: AiModel
  reasoningEffort: ReasoningEffort
  resultCount: number
  sortMode: SortMode
  engine: EngineId
  aiMode: boolean
  theme: ThemeMode
}

/** 设置默认值（与 PLAN 第 5 节一致） */
export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  aiModel: 'deepseek-flash',
  reasoningEffort: 'high',
  resultCount: 30,
  sortMode: 'relevance',
  engine: 'bing',
  aiMode: true,
  theme: 'system',
}

/** 设置面板可选的 AI 模型顺序 */
export const AI_MODELS: readonly AiModel[] = ['deepseek-flash', 'deepseek-v4-pro']

/** 思考挡位顺序（关闭 → 最高） */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['off', 'low', 'high', 'max']

/** 排序模式 */
export const SORT_MODES: readonly SortMode[] = ['relevance', 'latest']

/** 外部搜索引擎顺序 */
export const ENGINE_IDS: readonly EngineId[] = ['bing', 'google', 'baidu', 'duckduckgo']

/** 搜索结果条数范围 */
export const RESULT_COUNT_MIN = 1
export const RESULT_COUNT_MAX = 50

/** Search API 单条结果（字段名保持 API 原始 snake_case） */
export interface SearchResult {
  rerank_score: number
  title: string
  url: string
  snippet: string
  summary: string
  content: string
  site_name: string
  site_icon: string
  date: string
  author: string
  authority: number | null
}

/** Chat 消息（请求与本地会话历史共用；历史不回传 reasoning_content） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 归一化后的 Chat usage */
export interface ChatUsage {
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
}

/** Chat API 归一化结果 */
export interface ChatResult {
  content: string
  reasoningContent: string
  usage: ChatUsage
  model: string
  finishReason: string
}

/** 单个模型的累计用量（usage.v1 内的 models 字典值） */
export interface ModelUsage {
  promptHitTokens: number
  promptMissTokens: number
  completionTokens: number
  reasoningTokens: number
  requests: number
  /** 高峰时段预估费用（元） */
  peakCost: number
  /** 空闲时段预估费用（元） */
  offPeakCost: number
}

/** 本机数据统计（localStorage: deepsearch.usage.v1） */
export interface UsageStats {
  /** 搜索成功请求次数（失败不计入） */
  searches: number
  /** 成功且结果非空的搜索次数（计费次数） */
  searchBillable: number
  /** Search 费用（元） */
  searchCost: number
  /** 网页抓取成功请求次数（失败不计入） */
  fetches: number
  /** 成功且正文非空的抓取次数（计费次数） */
  fetchBillable: number
  /** Fetch 费用（元） */
  fetchCost: number
  /** 按模型名聚合的 Chat 用量 */
  models: Record<string, ModelUsage>
  /** 最后一次统计更新时间（epoch 毫秒） */
  updatedAt: number
}

/** AI 面板引用的来源 */
export interface AiSource {
  /** 从 1 开始的引用序号，对应正文中的 [n] */
  index: number
  title: string
  url: string
  siteName: string
}

/** 错误弹窗可直接消费的错误视图（ApiError 实例满足此形状） */
export interface ApiErrorView {
  status: number | null
  code: string
  type?: string
  message: string
  requestId?: string
  context?: ApiErrorContext
}

/** toast 类型 */
export type ToastKind = 'info' | 'success' | 'error'

/** 全局 toast 状态（同一时刻只显示一条，后到覆盖先到） */
export interface ToastState {
  message: string
  kind: ToastKind
  visible: boolean
}

/** API Key 弹窗状态 */
export interface ApiKeyModalState {
  open: boolean
}

/** 错误弹窗状态 */
export interface ErrorModalState {
  open: boolean
  title: string
  error: ApiErrorView | null
}
