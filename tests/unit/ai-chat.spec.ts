import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AiChat from '@/components/ai/AiChat.vue'
import type { ChatMessage } from '@/types'

const summaryMessage: ChatMessage = {
  role: 'assistant',
  content: '## 结论\n\n这是第一条摘要。',
}

describe('AiChat 对话线程', () => {
  it('初始摘要作为第一条消息，显示标签和输入框', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'ready',
        messages: [summaryMessage],
        showSummaryTags: true,
        excellentCount: 3,
        authorityCount: 2,
      },
    })

    expect(wrapper.text()).toContain('结论')
    expect(wrapper.text()).toContain('优质 3')
    expect(wrapper.text()).toContain('权威 2')
    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
    // 追问入口已移到结果卡片，线程内不再有单独按钮
    expect(wrapper.find('.ai-tags button').exists()).toBe(false)
  })

  it('结果网页会话不显示搜索摘要标签', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'followup-ready',
        messages: [summaryMessage],
        showSummaryTags: false,
        excellentCount: 3,
        authorityCount: 2,
      },
    })

    expect(wrapper.find('.ai-tags').exists()).toBe(false)
  })

  it('ready 阶段可直接发送问题', async () => {
    const wrapper = mount(AiChat, {
      props: { phase: 'ready', messages: [summaryMessage] },
    })

    await wrapper.find('textarea').setValue('这个结果的主要结论是什么？')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('ask')).toEqual([['这个结果的主要结论是什么？']])
  })

  it('asking 阶段禁用输入并展示等待状态', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'ready',
        messages: [summaryMessage, { role: 'user', content: '追问' }],
        asking: true,
      },
    })

    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="AI 正在回答"]').exists()).toBe(true)
  })

  it('流式首字到达前显示等待状态', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'followup-loading',
        messages: [{ role: 'user', content: '问题' }],
        asking: true,
      },
    })

    expect(wrapper.find('.markdown-view--streaming').exists()).toBe(false)
    expect(wrapper.find('[aria-label="AI 正在回答"]').exists()).toBe(true)
  })

  it('流式正文到达后显示光标并隐藏等待状态', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'followup-loading',
        messages: [
          { role: 'user', content: '问题' },
          { role: 'assistant', content: '已经到达的部分回答' },
        ],
        asking: true,
      },
    })

    expect(wrapper.find('.markdown-view--streaming').exists()).toBe(true)
    expect(wrapper.find('[aria-label="AI 正在回答"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('已经到达的部分回答')
  })

  it('追问期间 phase 保持 ready 时仍显示流式光标', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'ready',
        messages: [
          summaryMessage,
          { role: 'user', content: '追问' },
          { role: 'assistant', content: '正在到达的回答' },
        ],
        asking: true,
      },
    })

    expect(wrapper.find('.markdown-view--streaming').exists()).toBe(true)
    expect(wrapper.find('[aria-label="AI 正在回答"]').exists()).toBe(false)
  })

  it('追问首字到达前只显示等待状态', () => {
    const wrapper = mount(AiChat, {
      props: {
        phase: 'ready',
        messages: [summaryMessage, { role: 'user', content: '追问' }],
        asking: true,
      },
    })

    expect(wrapper.find('.markdown-view--streaming').exists()).toBe(false)
    expect(wrapper.find('[aria-label="AI 正在回答"]').exists()).toBe(true)
  })
})
