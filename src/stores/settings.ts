import { reactive } from 'vue'

import type {
  AiModel,
  EngineId,
  ReasoningEffort,
  Settings,
  SortMode,
  ThemeMode,
} from '@/types'
import {
  AI_MODELS,
  DEFAULT_SETTINGS,
  ENGINE_IDS,
  REASONING_EFFORTS,
  RESULT_COUNT_MAX,
  RESULT_COUNT_MIN,
  SORT_MODES,
} from '@/types'
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage'

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

/** 历史/别名模型名归一化（价格别名 deepseek-v4-flash 视为 Flash） */
const MODEL_ALIASES: Record<string, AiModel> = {
  'deepseek-v4-flash': 'deepseek-flash',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function normalizeResultCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.resultCount
  const rounded = Math.round(value)
  return Math.min(RESULT_COUNT_MAX, Math.max(RESULT_COUNT_MIN, rounded))
}

function normalizeAiModel(value: unknown): AiModel {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.aiModel
  const raw = value.trim()
  const normalized = MODEL_ALIASES[raw] ?? raw
  return pickOne(normalized, AI_MODELS, DEFAULT_SETTINGS.aiModel)
}

/**
 * 校验并归一化设置：未知字段丢弃，非法值回退默认值，条数收敛到 1–50。
 * 公开导出便于单元测试。
 */
export function normalizeSettings(input: unknown): Settings {
  const source = isRecord(input) ? input : {}
  return {
    apiKey: typeof source.apiKey === 'string' ? source.apiKey.trim() : DEFAULT_SETTINGS.apiKey,
    aiModel: normalizeAiModel(source.aiModel),
    reasoningEffort: pickOne<ReasoningEffort>(
      source.reasoningEffort,
      REASONING_EFFORTS,
      DEFAULT_SETTINGS.reasoningEffort,
    ),
    resultCount: normalizeResultCount(source.resultCount),
    sortMode: pickOne<SortMode>(source.sortMode, SORT_MODES, DEFAULT_SETTINGS.sortMode),
    engine: pickOne<EngineId>(source.engine, ENGINE_IDS, DEFAULT_SETTINGS.engine),
    aiMode: typeof source.aiMode === 'boolean' ? source.aiMode : DEFAULT_SETTINGS.aiMode,
    theme: pickOne<ThemeMode>(source.theme, THEME_MODES, DEFAULT_SETTINGS.theme),
  }
}

/** 单例响应式设置对象 */
const settings = reactive<Settings>(normalizeSettings(readJson(STORAGE_KEYS.settings)))

function persist(): void {
  writeJson(STORAGE_KEYS.settings, { ...settings })
}

/**
 * 设置单例（PLAN 第 6 节）：
 * - `settings`：响应式设置对象；
 * - `update(patch)`：校验后合并并立即写 localStorage；
 * - `resetAll()`：恢复默认值（含清空 Key），主题回到系统；
 * - `seedDevKey()`：开发模式从 .env 注入初始 Key（仅当当前没有 Key 时），返回是否注入。
 */
export function useSettings() {
  function update(patch: Partial<Settings>): void {
    Object.assign(settings, normalizeSettings({ ...settings, ...patch }))
    persist()
  }

  function resetAll(): void {
    Object.assign(settings, { ...DEFAULT_SETTINGS })
    persist()
  }

  function seedDevKey(): boolean {
    const devKey = typeof __DEV_API_KEY__ === 'string' ? __DEV_API_KEY__.trim() : ''
    if (!devKey || settings.apiKey) return false
    settings.apiKey = devKey
    persist()
    return true
  }

  return { settings, update, resetAll, seedDevKey }
}
