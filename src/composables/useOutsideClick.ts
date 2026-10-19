import { getCurrentScope, onScopeDispose, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

type ClickableTarget = HTMLElement | null | undefined
type TargetSource =
  | MaybeRefOrGetter<ClickableTarget | ClickableTarget[]>
  | Array<MaybeRefOrGetter<ClickableTarget>>

interface OutsideClickOptions {
  /** 为 false 时忽略外部点击（例如弹层关闭状态） */
  enabled?: MaybeRefOrGetter<boolean>
}

function resolveTargets(source: TargetSource): HTMLElement[] {
  const groups: Array<ClickableTarget | ClickableTarget[]> = Array.isArray(source)
    ? (source as Array<MaybeRefOrGetter<ClickableTarget>>).map((item) => toValue(item))
    : [toValue(source as MaybeRefOrGetter<ClickableTarget | ClickableTarget[]>)]

  const flat: ClickableTarget[] = []
  for (const group of groups) {
    if (Array.isArray(group)) flat.push(...group)
    else flat.push(group)
  }
  return flat.filter((target): target is HTMLElement => target instanceof HTMLElement)
}

function eventPathTargets(event: Event): EventTarget[] {
  if (typeof event.composedPath === 'function') return event.composedPath()
  return []
}

/**
 * 点击目标之外时触发回调（pointerdown 捕获阶段，兼容 Shadow DOM 的 composedPath）。
 * 在组件 setup 中调用，组件卸载时自动移除监听。
 */
export function useOutsideClick(
  targets: TargetSource,
  handler: (event: Event) => void,
  options: OutsideClickOptions = {},
): void {
  const listener = (event: Event): void => {
    if (options.enabled !== undefined && !toValue(options.enabled)) return
    const elements = resolveTargets(targets)
    if (elements.length === 0) return
    const path = eventPathTargets(event)
    const eventTarget = event.target
    const inside = elements.some((element) => {
      if (path.includes(element)) return true
      if (eventTarget instanceof Node) return element.contains(eventTarget)
      return false
    })
    if (!inside) handler(event)
  }

  document.addEventListener('pointerdown', listener, true)
  if (getCurrentScope()) {
    onScopeDispose(() => document.removeEventListener('pointerdown', listener, true))
  }
}

/** Esc 关闭弹层（冒泡阶段；模态框内的焦点陷阱使用捕获阶段并阻止继续传播） */
export function useEscapeKey(
  handler: (event: KeyboardEvent) => void,
  options: OutsideClickOptions = {},
): void {
  const listener = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    if (options.enabled !== undefined && !toValue(options.enabled)) return
    handler(event)
  }

  document.addEventListener('keydown', listener)
  if (getCurrentScope()) {
    onScopeDispose(() => document.removeEventListener('keydown', listener))
  }
}
