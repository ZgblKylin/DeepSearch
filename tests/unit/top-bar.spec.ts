import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import TopBar from '@/components/layout/TopBar.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'

/**
 * 顶栏品牌链接：
 * - 部署在子路径（如 `/search`）时，`href="./"` 会解析到上一层目录，必须用当前 pathname；
 * - 点击仍走 SPA 导航，保留子路径并去掉查询串。
 */
const route = useQueryRoute()

function mountTopBar() {
  return mount(TopBar, { global: { stubs: { teleport: true } } })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/search?q=test')
  route.syncFromLocation()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
  route.syncFromLocation()
})

describe('TopBar 品牌链接', () => {
  it('href 指向当前 pathname，而不是上一层目录', () => {
    const wrapper = mountTopBar()

    expect(wrapper.find('.topbar__brand').attributes('href')).toBe('/search')
  })

  it('点击品牌链接回到首页并保留子路径', async () => {
    const wrapper = mountTopBar()

    await wrapper.find('.topbar__brand').trigger('click')

    expect(window.location.pathname).toBe('/search')
    expect(window.location.search).toBe('')
    expect(route.query.value).toBe('')
  })
})
