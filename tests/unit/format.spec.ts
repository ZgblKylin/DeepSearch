import { describe, expect, it } from 'vitest'

import { formatCny } from '@/lib/format'

describe('formatCny', () => {
  it('按十进制四舍五入，避免二进制浮点边界', () => {
    expect(formatCny(0.065)).toBe('¥0.07')
    expect(formatCny(1.005)).toBe('¥1.01')
    expect(formatCny(0.1 + 0.2)).toBe('¥0.30')
    expect(formatCny(0.014)).toBe('¥0.01')
    expect(formatCny(0.015)).toBe('¥0.02')
  })

  it('小于一分保留四位小数', () => {
    expect(formatCny(0.005)).toBe('¥0.0050')
    expect(formatCny(0.00005)).toBe('¥0.0001')
    expect(formatCny(0.00004)).toBe('¥0.0000')
  })

  it('零、负数与非法值', () => {
    expect(formatCny(0)).toBe('¥0.00')
    expect(formatCny(-1)).toBe('—')
    expect(formatCny(null)).toBe('—')
    expect(formatCny(undefined)).toBe('—')
    expect(formatCny(Number.NaN)).toBe('—')
    expect(formatCny(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('常规金额保留两位小数', () => {
    expect(formatCny(0.12)).toBe('¥0.12')
    expect(formatCny(12.5)).toBe('¥12.50')
    expect(formatCny(100)).toBe('¥100.00')
  })
})
