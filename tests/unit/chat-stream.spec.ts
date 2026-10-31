import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatCompletion } from '@/lib/api'
import type { ChatCompletionParams, ChatStreamDelta } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import type { ChatMessage } from '@/types'

/**
 * Chat 流式响应解析：
 * - 正文与思考内容分开累积，思考内容不进入正文；
 * - 分片边界落在 JSON 中间时仍能正确拼接；
 * - 注释、事件名与无法解析的负载被忽略，不中断整个流；
 * - `[DONE]` 之后停止读取，usage 取自携带 usage 的 chunk；
 * - 省略 `onDelta` 时回落到一次性请求。
 */

const messages: ChatMessage[] = [{ role: 'user', content: '你好' }]
const MODEL = 'deepseek-flash'

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function sseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function stubFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

function streamParams(onDelta: (delta: ChatStreamDelta) => void): ChatCompletionParams {
  return {
    model: MODEL,
    messages,
    effort: 'off',
    onDelta,
  }
}

/** 读取最近一次 fetch 的请求体 */
function lastRequestBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls
  const init = calls[calls.length - 1]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chatCompletion 流式响应', () => {
  it('累积正文增量并读取 usage 与 finish_reason', async () => {
    stubFetch(
      sseResponse([
        sseEvent({ model: MODEL, choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] }),
        sseEvent({ model: MODEL, choices: [{ index: 0, delta: { content: '你好' } }] }),
        sseEvent({ model: MODEL, choices: [{ index: 0, delta: { content: '，世界' } }] }),
        sseEvent({
          model: MODEL,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
            prompt_cache_hit_tokens: 2,
            prompt_cache_miss_tokens: 8,
          },
        }),
        'data: [DONE]\n\n',
      ]),
    )

    const deltas: string[] = []
    const result = await chatCompletion(
      'sk-test',
      streamParams((delta) => deltas.push(delta.content)),
    )

    expect(result.content).toBe('你好，世界')
    expect(result.finishReason).toBe('stop')
    expect(result.model).toBe(MODEL)
    expect(result.usage.completionTokens).toBe(4)
    expect(result.usage.promptCacheHitTokens).toBe(2)
    expect(result.usage.promptCacheMissTokens).toBe(8)
    // 空内容不触发回调
    expect(deltas).toEqual(['你好', '，世界'])
  })

  it('思考内容与正文分开累积', async () => {
    stubFetch(
      sseResponse([
        sseEvent({ choices: [{ delta: { reasoning_content: '先想一想' } }] }),
        sseEvent({ choices: [{ delta: { content: '答案是 2' } }] }),
        'data: [DONE]\n\n',
      ]),
    )

    const result = await chatCompletion('sk-test', streamParams(() => undefined))

    expect(result.content).toBe('答案是 2')
    expect(result.reasoningContent).toBe('先想一想')
  })

  it('分片边界落在 JSON 中间时仍能解析', async () => {
    const full = sseEvent({ choices: [{ delta: { content: '完整内容' } }] })
    const cut = Math.floor(full.length / 2)
    stubFetch(sseResponse([full.slice(0, cut), full.slice(cut), 'data: [DONE]\n\n']))

    const result = await chatCompletion('sk-test', streamParams(() => undefined))

    expect(result.content).toBe('完整内容')
  })

  it('忽略注释、事件名与无法解析的负载', async () => {
    stubFetch(
      sseResponse([
        ': keep-alive\n\n',
        'event: message\n\n',
        'data: {not-json}\n\n',
        sseEvent({ choices: [{ delta: { content: '仍然可用' } }] }),
        'data: [DONE]\n\n',
      ]),
    )

    const result = await chatCompletion('sk-test', streamParams(() => undefined))

    expect(result.content).toBe('仍然可用')
  })

  it('流式请求体携带 stream 与 include_usage', async () => {
    stubFetch(sseResponse(['data: [DONE]\n\n']))

    await chatCompletion('sk-test', streamParams(() => undefined))

    const body = lastRequestBody()
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  it('没有正文时返回空字符串与零值 usage', async () => {
    stubFetch(sseResponse(['data: [DONE]\n\n']))

    const result = await chatCompletion('sk-test', streamParams(() => undefined))

    expect(result.content).toBe('')
    expect(result.usage.totalTokens).toBe(0)
  })

  it('非 2xx 归一化为 ApiError', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Key 无效' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(chatCompletion('sk-test', streamParams(() => undefined))).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    })
  })

  it('缺少响应体数据流时报 invalid_response', async () => {
    stubFetch(new Response(null, { status: 200 }))

    const error = await chatCompletion('sk-test', streamParams(() => undefined)).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('invalid_response')
  })
})

describe('chatCompletion 一次性响应', () => {
  it('省略 onDelta 时使用一次性请求', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          model: MODEL,
          choices: [{ message: { content: '一次性' }, finish_reason: 'stop' }],
          usage: { total_tokens: 7 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await chatCompletion('sk-test', { model: MODEL, messages, effort: 'off' })

    expect(result.content).toBe('一次性')
    expect(result.usage.totalTokens).toBe(7)
    const body = lastRequestBody()
    expect(body).not.toHaveProperty('stream')
    expect(body).not.toHaveProperty('stream_options')
  })
})
