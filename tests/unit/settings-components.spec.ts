import { flushPromises, mount } from '@vue/test-utils'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Component } from 'vue'

import ApiKeyModal from '@/components/settings/ApiKeyModal.vue'
import ErrorModal from '@/components/settings/ErrorModal.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import { ApiError } from '@/lib/errors'
import type { ChatUsage } from '@/types'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { useUsage } from '@/stores/usage'

const settingsStore = useSettings()
const uiStore = useUi()
const usageStore = useUsage()

const PEAK_TIME = new Date('2026-10-19T10:00:00+08:00')

function chatHit(tokens: number): ChatUsage {
  return {
    promptCacheHitTokens: tokens,
    promptCacheMissTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: tokens,
  }
}

let wrapper: VueWrapper | null = null

function mountComponent(component: Component): VueWrapper {
  wrapper = mount(component, {
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  }) as unknown as VueWrapper
  return wrapper
}

function currentWrapper(): VueWrapper {
  if (!wrapper) throw new Error('组件尚未挂载')
  return wrapper
}

function buttons(): DOMWrapper<Element>[] {
  return currentWrapper().findAll('button') as DOMWrapper<Element>[]
}

function findButton(text: string): DOMWrapper<Element> {
  const found = buttons().find((button) => button.text().trim() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}

function findButtonContaining(text: string): DOMWrapper<Element> {
  const found = buttons().find((button) => button.text().includes(text))
  if (!found) throw new Error(`未找到包含“${text}”的按钮`)
  return found
}

beforeEach(() => {
  settingsStore.resetAll()
  usageStore.resetUsage()
  uiStore.closeApiKeyModal()
  uiStore.closeErrorModal()
  uiStore.closeSettings()
  uiStore.dismissToast()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('ApiKeyModal', () => {
  it('渲染标题，空值不可保存；保存后关闭并执行被拦截的操作', async () => {
    const action = vi.fn()
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal(action)
    await nextTick()

    expect(currentWrapper().text()).toContain('配置 DeepSeek API Key')
    expect(findButton('保存').attributes('disabled')).toBeDefined()

    await currentWrapper().find('input').setValue('  sk-test-key  ')
    expect(findButton('保存').attributes('disabled')).toBeUndefined()

    await findButton('保存').trigger('click')
    await flushPromises()

    expect(settingsStore.settings.apiKey).toBe('sk-test-key')
    expect(uiStore.ui.apiKeyModal.open).toBe(false)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('显示 / 隐藏 Key 切换输入框类型', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()

    const input = currentWrapper().find('input')
    expect(input.attributes('type')).toBe('password')

    await currentWrapper().find('button[aria-label="显示 API Key"]').trigger('click')
    expect(input.attributes('type')).toBe('text')

    await currentWrapper().find('button[aria-label="隐藏 API Key"]').trigger('click')
    expect(input.attributes('type')).toBe('password')
  })

  it('打开后焦点落在 API Key 输入框（initial-focus）', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()
    await nextTick()

    const input = currentWrapper().find('#api-key-input')
    expect(document.activeElement).toBe(input.element)
  })

  it('输入框位于 form 内，提交被拦截且保存生效', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()

    const input = currentWrapper().find('#api-key-input')
    expect((input.element as HTMLInputElement).closest('form')).not.toBeNull()

    await input.setValue('sk-modal-form')
    await currentWrapper().find('form').trigger('submit')
    await flushPromises()

    expect(settingsStore.settings.apiKey).toBe('sk-modal-form')
  })

  it('点击外部（遮罩）关闭弹窗', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()

    await currentWrapper().find('.modal__overlay').trigger('click')
    expect(uiStore.ui.apiKeyModal.open).toBe(false)
  })

  it('Esc 关闭弹窗', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()
    await nextTick()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(uiStore.ui.apiKeyModal.open).toBe(false)
  })

  it('保存时忽略纯空白 Key 并给出提示', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()

    await currentWrapper().find('input').setValue('   ')
    await currentWrapper().find('input').trigger('keydown.enter')

    expect(currentWrapper().text()).toContain('请输入 API Key 后再保存')
    expect(settingsStore.settings.apiKey).toBe('')
  })
})

describe('ErrorModal', () => {
  it('展示 HTTP 状态码、错误码、message、请求 ID 与 401 建议', async () => {
    mountComponent(ErrorModal)
    uiStore.showError(
      new ApiError({
        status: 401,
        code: 'invalid_api_key',
        message: 'Invalid API key',
        requestId: 'req_123',
        context: 'test',
      }),
    )
    await nextTick()

    const text = currentWrapper().text()
    expect(text).toContain('连接测试失败')
    expect(text).toContain('401')
    expect(text).toContain('invalid_api_key')
    expect(text).toContain('Invalid API key')
    expect(text).toContain('req_123')
    expect(text).toContain('请检查 API Key 是否正确或已失效。')
  })

  it('网络错误显示 — 与 network_error 及网络建议', async () => {
    mountComponent(ErrorModal)
    uiStore.showError(
      new ApiError({ status: null, code: 'network_error', message: '网络连接失败，请检查网络后重试' }),
    )
    await nextTick()

    const text = currentWrapper().text()
    expect(text).toContain('—')
    expect(text).toContain('network_error')
    expect(text).toContain('请检查网络连接后重试。')
  })

  it('复制详情写入剪贴板', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    const clipboard = { writeText }
    vi.stubGlobal('navigator', { clipboard })

    mountComponent(ErrorModal)
    uiStore.showError(
      new ApiError({
        status: 429,
        code: 'rate_limit',
        message: 'Too many requests',
      }),
    )
    await nextTick()

    await findButton('复制详情').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('HTTP 状态码：429')
    expect(copied).toContain('错误码：rate_limit')
    expect(copied).toContain('错误消息：Too many requests')
  })

  it('点击外部（遮罩）关闭错误弹窗', async () => {
    mountComponent(ErrorModal)
    uiStore.showError(new ApiError({ status: 500, message: 'Server error' }))
    await nextTick()

    await currentWrapper().find('.modal__overlay').trigger('click')
    expect(uiStore.ui.errorModal.open).toBe(false)
  })
})

describe('SettingsPanel', () => {
  async function openPanel(): Promise<VueWrapper> {
    mountComponent(SettingsPanel)
    uiStore.openSettings()
    await nextTick()
    return currentWrapper()
  }

  it('渲染连接、偏好、引擎、统计与危险操作分区', async () => {
    const panel = await openPanel()
    const text = panel.text()

    expect(text).toContain('设置')
    expect(text).toContain('连接配置')
    expect(text).toContain('API Key')
    expect(text).toContain('AI 模型')
    expect(text).toContain('思考挡位')
    expect(text).toContain('搜索偏好')
    expect(text).toContain('每次返回条数')
    expect(text).toContain('外部搜索引擎')
    expect(text).toContain('本机数据统计')
    expect(text).toContain('危险操作')
  })

  it('条数、排序、模型、挡位、引擎修改即时写入 settings', async () => {
    const panel = await openPanel()

    await findButton('20 条').trigger('click')
    expect(settingsStore.settings.resultCount).toBe(20)

    await panel.find('#settings-result-count').setValue('120')
    await panel.find('#settings-result-count').trigger('change')
    await nextTick()
    expect(settingsStore.settings.resultCount).toBe(50)

    await findButton('最新').trigger('click')
    expect(settingsStore.settings.sortMode).toBe('latest')

    await findButtonContaining('DeepSeek V4 Pro').trigger('click')
    expect(settingsStore.settings.aiModel).toBe('deepseek-v4-pro')

    await findButton('最高').trigger('click')
    expect(settingsStore.settings.reasoningEffort).toBe('max')

    await findButtonContaining('百度').trigger('click')
    expect(settingsStore.settings.engine).toBe('baidu')
  })

  it('统计总览与模型峰谷表展示 token 与费用', async () => {
    usageStore.recordChat('deepseek-flash', chatHit(1_000_000), PEAK_TIME)
    usageStore.recordSearch(3)

    const panel = await openPanel()
    const text = panel.text()

    expect(text).toContain('Token 总消耗')
    expect(text).toContain('1,000,000')
    expect(text).toContain('DeepSeek Flash')
    expect(text).toContain('¥0.04')
    expect(text).toContain('¥0.0050')
  })

  it('清零用量需要二次确认，仅清统计不动 Key', async () => {
    settingsStore.update({ apiKey: 'sk-keep' })
    usageStore.recordSearch(3)
    const panel = await openPanel()

    await findButton('清零用量').trigger('click')
    expect(panel.text()).toContain('确定清零本机统计？')
    expect(usageStore.usage.searches).toBe(1)

    await findButton('确认清零').trigger('click')
    expect(usageStore.usage.searches).toBe(0)
    expect(settingsStore.settings.apiKey).toBe('sk-keep')
  })

  it('清空数据需要二次确认：清 Key / 设置 / 统计、主题回系统、回首页', async () => {
    settingsStore.update({ apiKey: 'sk-secret', theme: 'dark' })
    usageStore.recordSearch(4)
    window.history.replaceState(null, '', '/?q=deepseek')

    const panel = await openPanel()
    await findButton('清空数据').trigger('click')
    expect(panel.text()).toContain('确定清空全部本机数据？')

    await findButton('确认清空').trigger('click')
    await nextTick()

    expect(settingsStore.settings.apiKey).toBe('')
    expect(settingsStore.settings.theme).toBe('system')
    expect(usageStore.usage.searches).toBe(0)
    expect(window.location.search).toBe('')
    expect(uiStore.ui.settingsOpen).toBe(false)
  })

  it('API Key 输入位于 form 内，提交只持久化、不刷新页面', async () => {
    const panel = await openPanel()
    const input = panel.find('#settings-api-key')
    expect((input.element as HTMLInputElement).closest('form')).not.toBeNull()

    await input.setValue('sk-settings-form')
    await panel.find('form').trigger('submit')
    await nextTick()

    expect(settingsStore.settings.apiKey).toBe('sk-settings-form')
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
  })

  it('打开时锁定 body 滚动并聚焦面板，关闭后恢复焦点与滚动', async () => {
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.textContent = '打开设置'
    document.body.appendChild(trigger)
    trigger.focus()

    mountComponent(SettingsPanel)
    uiStore.openSettings()
    await nextTick()
    await nextTick()

    expect(document.body.style.overflow).toBe('hidden')
    const panelEl = currentWrapper().find('.settings__panel').element
    expect(panelEl.contains(document.activeElement)).toBe(true)

    uiStore.closeSettings()
    await nextTick()

    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('Tab 焦点陷阱：从面板最后一个可聚焦元素 Tab 回到面板内', async () => {
    const panel = await openPanel()
    const panelEl = panel.find('.settings__panel').element
    const focusables = Array.from(
      panelEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
    const last = focusables[focusables.length - 1]
    last.focus()
    expect(document.activeElement).toBe(last)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await nextTick()

    expect(panelEl.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
  })

  it('Key / 错误弹窗打开时面板保持滚动锁定且不关闭', async () => {
    mountComponent(SettingsPanel)
    uiStore.openSettings()
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    uiStore.showError(new ApiError({ status: 400, message: 'Bad request' }))
    await nextTick()
    expect(uiStore.ui.settingsOpen).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    uiStore.closeErrorModal()
    await nextTick()
    expect(uiStore.ui.settingsOpen).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    uiStore.closeSettings()
    await nextTick()
    expect(document.body.style.overflow).toBe('')
  })

  it('点击遮罩与 Esc 关闭设置面板', async () => {
    let panel = await openPanel()
    await panel.find('.settings__overlay').trigger('click')
    expect(uiStore.ui.settingsOpen).toBe(false)

    panel = await openPanel()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(uiStore.ui.settingsOpen).toBe(false)
  })
})
