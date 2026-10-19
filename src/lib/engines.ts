/**
 * 外部搜索引擎元数据与 URL 构造（PLAN 3.2）。
 *
 * 仅生成跳转链接：搜索本身由 DeepSeek Search API 完成；外部引擎按钮用于
 * 在对应引擎中打开同一查询串。所有 URL 均为 https，且不在页面中加载任何外部资源。
 *
 * `logo` 是内联 SVG 内部标记（不含 `<svg>` 外壳），与共享 `Icon` 的做法一致：
 * 页面不请求外链图片，构建产物保持单文件。
 */

import type { EngineId } from '@/types'
import { ENGINE_IDS } from '@/types'

/** 单个外部搜索引擎的展示与跳转信息 */
export interface EngineInfo {
  id: EngineId
  /** 展示名称 */
  name: string
  /** 品牌色（logo 与偏好卡片使用） */
  color: string
  /** 内联 SVG logo 的内部标记（24×24 视口） */
  logo: string
  /** 搜索引擎首页（空查询时使用） */
  homeUrl: string
  /** 搜索 URL 构造器；查询串会被 encodeURIComponent 编码 */
  searchUrl: (query: string) => string
}

/** 把查询串编码为 URL 查询参数值 */
export function encodeEngineQuery(query: string): string {
  return encodeURIComponent(query.trim())
}

function createEngine(
  id: EngineId,
  name: string,
  color: string,
  logo: string,
  homeUrl: string,
  build: (encoded: string) => string,
): EngineInfo {
  return {
    id,
    name,
    color,
    logo,
    homeUrl,
    searchUrl: (query: string) => {
      const encoded = encodeEngineQuery(query)
      return encoded ? build(encoded) : homeUrl
    },
  }
}

/** 全部外部搜索引擎（按 PLAN 3.6 顺序：Bing、Google、百度、DuckDuckGo） */
export const ENGINES: Record<EngineId, EngineInfo> = {
  bing: createEngine(
    'bing',
    'Bing',
    '#0078d4',
    '<path d="M5 2.5h4v13.2l-4-2V2.5Z" fill="#0078d4" />' +
      '<path d="M9 6.4 19 10v3l-10-1.9V6.4Z" fill="#37b3e2" />' +
      '<path d="M9 15.6 19 13v3.2l-10 3.3v-3.9Z" fill="#008373" />',
    'https://www.bing.com/',
    (encoded) => `https://www.bing.com/search?q=${encoded}`,
  ),
  google: createEngine(
    'google',
    'Google',
    '#4285f4',
    '<path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z" fill="#4285f4" />' +
      '<path d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22Z" fill="#34a853" />' +
      '<path d="M6.41 13.92a6 6 0 0 1 0-3.84V7.5H3.06a10 10 0 0 0 0 9l3.35-2.58Z" fill="#fbbc05" />' +
      '<path d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.5l3.35 2.58C7.2 7.72 9.4 5.96 12 5.96Z" fill="#ea4335" />',
    'https://www.google.com/',
    (encoded) => `https://www.google.com/search?q=${encoded}`,
  ),
  baidu: createEngine(
    'baidu',
    '百度',
    '#2932e1',
    '<circle cx="12" cy="12" r="10" fill="#2932e1" />' +
      '<g fill="#ffffff">' +
      '<ellipse cx="8.1" cy="9.4" rx="1.1" ry="1.45" transform="rotate(-18 8.1 9.4)" />' +
      '<ellipse cx="11" cy="8.1" rx="1.1" ry="1.45" transform="rotate(-6 11 8.1)" />' +
      '<ellipse cx="14.1" cy="8.3" rx="1.1" ry="1.45" transform="rotate(8 14.1 8.3)" />' +
      '<ellipse cx="16.9" cy="10" rx="1.02" ry="1.35" transform="rotate(22 16.9 10)" />' +
      '<path d="M12.2 11.3c2.2 0 4.4 2.7 3.6 4.8-.5 1.3-2.1 1.8-3.6 1.8s-3.1-.5-3.6-1.8c-.8-2.1 1.4-4.8 3.6-4.8Z" />' +
      '</g>',
    'https://www.baidu.com/',
    (encoded) => `https://www.baidu.com/s?wd=${encoded}`,
  ),
  duckduckgo: createEngine(
    'duckduckgo',
    'DuckDuckGo',
    '#de5833',
    '<circle cx="12" cy="12" r="10" fill="#de5833" />' +
      '<path d="M6.9 9.6a4.8 4.8 0 0 1 8.1 1.1l3.3 1.8-3.3 1.1a4.9 4.9 0 0 1-8 1c.3-1.4.2-2.7-.1-3.8Z" fill="#ffffff" />' +
      '<circle cx="11.4" cy="10.9" r="0.95" fill="#de5833" />',
    'https://duckduckgo.com/',
    (encoded) => `https://duckduckgo.com/?q=${encoded}`,
  ),
}

/** 外部搜索引擎列表（保持显示顺序） */
export const ENGINE_LIST: readonly EngineInfo[] = ENGINE_IDS.map((id) => ENGINES[id])

/** 判断任意值是否是合法的引擎 ID */
export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value)
}

/** 读取引擎元数据；未知 ID 回退 Bing（保证 UI 不因脏数据崩溃） */
export function getEngine(id: EngineId): EngineInfo {
  return ENGINES[id] ?? ENGINES.bing
}

/**
 * 构造外部引擎搜索 URL；查询为空时返回引擎首页。
 * 调用方仍应在空查询时禁用按钮（PLAN 3.2）。
 */
export function buildEngineSearchUrl(id: EngineId, query: string): string {
  return getEngine(id).searchUrl(query)
}
