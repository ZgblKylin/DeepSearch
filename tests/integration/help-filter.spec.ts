import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import FilterBar from '@/components/results/FilterBar.vue'
import HelpPopover from '@/components/search/HelpPopover.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useSettings } from '@/stores/settings'

/**
 * 集成测试：帮助浮窗与筛选栏。
 *
 * 不发起真实搜索：筛选栏只验证“应用筛选 → 写 URL + 触发 run(q)”的编排，
 * run 使用 spy 替换，避免网络与 Key 弹窗。
 */
const { runSpy } = vi.hoisted(() => ({ runSpy: vi.fn() }))

vi.mock('@/composables/useSearch', () => ({
  useSearch: () => ({ run: runSpy }),
}))

const settingsStore = useSettings()
const { syncFromLocation } = useQueryRoute()

let wrapper: VueWrapper | null = null

function mountComponent(component: Parameters<typeof mount>[0]): VueWrapper {
  wrapper = mount(component, { attachTo: document.body }) as unknown as VueWrapper
  return wrapper
}

function currentQuery(): string {
  return new URLSearchParams(window.location.search).get('q') ?? ''
}

function findChip(label: string) {
  const chip = wrapper!
    .findAll('.filter-chip')
    .find((item) => item.find('.filter-chip__label').text().trim() === label)
  if (!chip) throw new Error(`未找到筛选 chip：${label}`)
  return chip
}

/**
 * 返回最新打开的筛选弹层。
 *
 * Popover 关闭过渡期间旧面板仍会短暂留在 DOM 中，因此取最后一个匹配节点，
 * 并等待一帧让旧面板的离场过渡结束。
 */
function panel() {
  const panels = wrapper!.findAll('.filter-bar__panel')
  const found = panels[panels.length - 1]
  if (!found) throw new Error('筛选弹层未打开')
  return found
}

async function openGroup(label: string): Promise<void> {
  await findChip(label).trigger('click')
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 40))
}

function panelButton(text: string) {
  const button = panel()
    .findAll('button')
    .find((item) => item.text().replace(/\s+/g, ' ').trim() === text)
  if (!button) throw new Error(`弹层内未找到按钮：${text}`)
  return button
}

beforeEach(() => {
  runSpy.mockClear()
  settingsStore.resetAll()
  window.history.replaceState(null, '', '/?q=DeepSeek')
  syncFromLocation()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('HelpPopover：hover / 固定 / 外部关闭', () => {
  async function openByHover(): Promise<void> {
    wrapper!.find('.help-popover').trigger('mouseenter')
    await new Promise((resolve) => setTimeout(resolve, 320))
    await nextTick()
  }

  it('hover 延迟打开，点击外部关闭', async () => {
    mountComponent(HelpPopover)
    await openByHover()

    expect(wrapper!.find('.help-popover__panel').exists()).toBe(true)
    expect(wrapper!.findAll('.help__row')).toHaveLength(9)
    const docs = wrapper!.find('.help__docs')
    expect(docs.attributes('href')).toBe('https://api-docs.deepseek.com/zh-cn/')
    expect(docs.attributes('target')).toBe('_blank')
    expect(docs.attributes('rel')).toBe('noopener noreferrer')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper!.find('.help-popover__panel').exists()).toBe(false)
  })

  it('点击固定后鼠标移出仍保持，Esc 关闭', async () => {
    mountComponent(HelpPopover)
    await wrapper!.find('.help-popover__trigger').trigger('click')
    await nextTick()
    expect(wrapper!.find('.help-popover__panel').exists()).toBe(true)

    wrapper!.find('.help-popover').trigger('mouseleave')
    await new Promise((resolve) => setTimeout(resolve, 240))
    await nextTick()
    expect(wrapper!.find('.help-popover__panel').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper!.find('.help-popover__panel').exists()).toBe(false)
  })
})

describe('FilterBar：应用筛选写回 q 并触发 run', () => {
  it('站点筛选写入 URL 并调用 run(q)，chip 显示筛选值', async () => {
    mountComponent(FilterBar)
    await openGroup('站点')

    await panel().find('textarea[aria-label="包含站点"]').setValue('github.com')
    await panelButton('应用').trigger('click')
    await nextTick()

    const expected = 'site:github.com DeepSeek'
    expect(currentQuery()).toBe(expected)
    expect(runSpy).toHaveBeenCalledWith(expected)
    expect(findChip('站点').text()).toContain('github.com')
  })

  it('语言与日期筛选可组合，日期冲突只提示不请求', async () => {
    mountComponent(FilterBar)

    await openGroup('语言')
    await panel().find('input[aria-label="语言代码"]').setValue('zh,en')
    await panelButton('应用').trigger('click')
    await nextTick()
    expect(currentQuery()).toBe('lang:zh,en DeepSeek')

    runSpy.mockClear()
    await openGroup('日期')
    await panel().find('input[aria-label="起始日期"]').setValue('2026-01-01')
    await panel().find('input[aria-label="结束日期"]').setValue('2025-01-01')
    await nextTick()

    expect(panel().text()).toContain('起始日期不能晚于结束日期')
    expect(panelButton('应用').attributes('disabled')).toBeDefined()
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('单组清除保留问题正文并触发重新搜索', async () => {
    mountComponent(FilterBar)

    await openGroup('站点')
    await panel().find('textarea[aria-label="包含站点"]').setValue('example.com')
    await panelButton('应用').trigger('click')
    await nextTick()
    expect(currentQuery()).toBe('site:example.com DeepSeek')

    await wrapper!.find('[aria-label="清除站点筛选"]').trigger('click')
    await nextTick()
    expect(currentQuery()).toBe('DeepSeek')
    expect(runSpy).toHaveBeenLastCalledWith('DeepSeek')
  })

  it('“清除筛选”清除全部筛选项并保留问题正文', async () => {
    mountComponent(FilterBar)

    await openGroup('站点')
    await panel().find('textarea[aria-label="包含站点"]').setValue('example.com')
    await panelButton('应用').trigger('click')
    await nextTick()
    expect(currentQuery()).toBe('site:example.com DeepSeek')

    runSpy.mockClear()
    await wrapper!.find('.filter-bar__clear').trigger('click')
    await nextTick()
    expect(currentQuery()).toBe('DeepSeek')
    expect(runSpy).toHaveBeenLastCalledWith('DeepSeek')
  })
})
