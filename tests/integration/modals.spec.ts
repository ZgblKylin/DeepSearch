import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import ApiKeyModal from '@/components/settings/ApiKeyModal.vue'
import ErrorModal from '@/components/settings/ErrorModal.vue'
import { ApiError } from '@/lib/errors'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'

/**
 * 集成测试：Key 弹窗与错误弹窗的完整交互。
 *
 * 不发起真实网络请求；只覆盖弹窗、store 与被拦截动作之间的协作。
 */
const settingsStore = useSettings()
const uiStore = useUi()

let wrapper: VueWrapper | null = null

function mountComponent(component: Parameters<typeof mount>[0]): VueWrapper {
  wrapper = mount(component, {
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  }) as unknown as VueWrapper
  return wrapper
}

function buttons(): Element[] {
  return Array.from(document.querySelectorAll('button'))
}

function findButton(text: string): HTMLButtonElement {
  const found = buttons().find((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found as HTMLButtonElement
}

beforeEach(() => {
  settingsStore.resetAll()
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
})

describe('Key 弹窗：保存与继续被拦截操作', () => {
  it('保存后写入 settings、关闭弹窗并执行一次被拦截的动作', async () => {
    const action = vi.fn()
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal(action)
    await nextTick()

    await wrapper!.find('input').setValue('  sk-integration-key  ')
    findButton('保存').click()
    await flushPromises()

    expect(settingsStore.settings.apiKey).toBe('sk-integration-key')
    expect(uiStore.ui.apiKeyModal.open).toBe(false)
    expect(action).toHaveBeenCalledTimes(1)
    expect(uiStore.ui.toast.visible).toBe(true)
    expect(uiStore.ui.toast.message).toBe('API Key 已保存')
  })

  it('点击外部（遮罩）关闭：不保存、不执行被拦截的动作', async () => {
    const action = vi.fn()
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal(action)
    await nextTick()

    await wrapper!.find('.modal__overlay').trigger('click')
    await flushPromises()

    expect(uiStore.ui.apiKeyModal.open).toBe(false)
    expect(settingsStore.settings.apiKey).toBe('')
    expect(action).not.toHaveBeenCalled()
  })

  it('Esc 关闭且不执行被拦截的动作', async () => {
    const action = vi.fn()
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal(action)
    await nextTick()
    await nextTick()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(uiStore.ui.apiKeyModal.open).toBe(false)
    expect(action).not.toHaveBeenCalled()
  })

  it('空 Key 保存被拒绝并给出行内提示', async () => {
    mountComponent(ApiKeyModal)
    uiStore.openApiKeyModal()
    await nextTick()

    expect(findButton('保存').disabled).toBe(true)
    await wrapper!.find('input').setValue('   ')
    await wrapper!.find('input').trigger('keydown.enter')
    await nextTick()

    expect(document.body.textContent).toContain('请输入 API Key 后再保存')
    expect(settingsStore.settings.apiKey).toBe('')
    expect(uiStore.ui.apiKeyModal.open).toBe(true)
  })
})

describe('错误弹窗：字段与关闭', () => {
  it('展示 HTTP 状态码、错误码、message、请求 ID、错误类型与 401 建议', async () => {
    mountComponent(ErrorModal)
    uiStore.showError(
      new ApiError({
        status: 401,
        code: 'invalid_api_key',
        type: 'authentication_error',
        message: 'Invalid API key',
        requestId: 'req_integration_1',
        context: 'test',
      }),
    )
    await nextTick()

    const text = document.body.textContent ?? ''
    expect(text).toContain('连接测试失败')
    expect(text).toContain('HTTP 状态码')
    expect(text).toContain('401')
    expect(text).toContain('invalid_api_key')
    expect(text).toContain('Invalid API key')
    expect(text).toContain('req_integration_1')
    expect(text).toContain('authentication_error')
    expect(text).toContain('请检查 API Key 是否正确或已失效。')
  })

  it('网络错误显示 “—” 状态码与 network_error，且新错误覆盖旧错误', async () => {
    mountComponent(ErrorModal)
    uiStore.showError(new ApiError({ status: 500, message: 'Server error' }))
    await nextTick()
    expect(document.body.textContent).toContain('500')

    uiStore.showError(new ApiError({ status: null, code: 'network_error' }))
    await nextTick()
    const text = document.body.textContent ?? ''
    expect(text).toContain('—')
    expect(text).toContain('network_error')
    expect(text).toContain('网络连接失败，请检查网络后重试')
    expect(uiStore.ui.errorModal.open).toBe(true)
  })

  it('点击遮罩关闭错误弹窗并清空错误状态', async () => {
    mountComponent(ErrorModal)
    uiStore.showError(new ApiError({ status: 402, message: 'Insufficient balance' }))
    await nextTick()

    await wrapper!.find('.modal__overlay').trigger('click')
    await nextTick()

    expect(uiStore.ui.errorModal.open).toBe(false)
    expect(uiStore.ui.errorModal.error).toBeNull()
  })
})
