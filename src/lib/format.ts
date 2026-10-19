/**
 * 展示层格式化工具。
 *
 * 仅做纯函数格式化，不读取全局状态；空值统一显示“—”，日期统一 `YYYY-MM-DD`。
 */

/** 数字千分位格式化；非有限数显示“—” */
export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** 相关度分数：固定两位小数 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—'
  return score.toFixed(2)
}

/** 耗时：小于 1 秒显示毫秒，否则显示一位小数秒 */
export function formatElapsed(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} 毫秒`
  return `${(ms / 1000).toFixed(1)} 秒`
}

/**
 * 十进制四舍五入（half-up）。
 *
 * 先按 15 位有效数字消除二进制浮点尾差，再四舍五入：
 * 0.065 * 100 = 6.500000000000001 → 7（直接 toFixed 会得到 0.06）。
 */
function roundDecimal(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits
  const scaled = Number((value * factor).toPrecision(15))
  return Math.round(scaled) / factor
}

/**
 * 金额：0 显示 ¥0.00；小于 0.01 保留四位小数；其余两位小数。
 * 舍入使用明确的十进制四舍五入，避免 0.065 → ¥0.06 的浮点边界（QA P3-4）。
 */
export function formatCny(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '—'
  if (value === 0) return '¥0.00'
  if (value < 0.01) return `¥${roundDecimal(value, 4).toFixed(4)}`
  return `¥${roundDecimal(value, 2).toFixed(2)}`
}

/**
 * 日期展示：优先解析 `YYYY-MM-DD` 前缀；无法解析时返回空串。
 */
export function formatDate(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string') {
    const prefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
    if (prefix) return `${prefix[1]}-${prefix[2]}-${prefix[3]}`
    const yearMonth = /^(\d{4})-(\d{2})$/.exec(value.trim())
    if (yearMonth) return `${yearMonth[1]}-${yearMonth[2]}`
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 时间戳 → `YYYY-MM-DD HH:mm` */
export function formatDateTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${formatDate(date)} ${hours}:${minutes}`
}
