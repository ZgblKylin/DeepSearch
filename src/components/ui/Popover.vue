<script setup lang="ts">
import { computed, ref } from 'vue'

import { useEscapeKey, useOutsideClick } from '@/composables/useOutsideClick'

/**
 * 轻量锚定弹层：trigger 插槽渲染触发元素，默认插槽渲染面板。
 *
 * 受控用法：`v-model:open`。默认点击外部 / Esc 关闭，可通过属性关闭该行为。
 * 面板绝对定位在触发元素下方，按 `align` 对齐。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    /** 面板与触发元素的水平对齐方式 */
    align?: 'start' | 'end'
    /** 面板与触发元素的垂直间距（px） */
    offset?: number
    /** 追加到面板的 class */
    panelClass?: string
    /** 点击外部是否关闭，默认 true */
    dismissOnOutsideClick?: boolean
    /** Esc 是否关闭，默认 true */
    dismissOnEscape?: boolean
    /** 面板 role；默认不设置（由使用方在插槽内声明语义） */
    role?: string
  }>(),
  {
    align: 'end',
    offset: 8,
    panelClass: '',
    dismissOnOutsideClick: true,
    dismissOnEscape: true,
    role: undefined,
  },
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const rootRef = ref<HTMLElement | null>(null)

const panelStyle = computed(() => ({ top: `calc(100% + ${props.offset}px)` }))
const outsideEnabled = computed(() => props.open && props.dismissOnOutsideClick)
const escapeEnabled = computed(() => props.open && props.dismissOnEscape)

function setOpen(value: boolean): void {
  emit('update:open', value)
}

function toggle(): void {
  setOpen(!props.open)
}

function close(): void {
  setOpen(false)
}

useOutsideClick(rootRef, () => setOpen(false), { enabled: outsideEnabled })
useEscapeKey(() => setOpen(false), { enabled: escapeEnabled })
</script>

<template>
  <div ref="rootRef" class="popover">
    <slot name="trigger" :open="props.open" :toggle="toggle" />
    <Transition name="popover">
      <div
        v-if="props.open"
        class="popover__panel"
        :class="[`popover__panel--${props.align}`, props.panelClass]"
        :style="panelStyle"
        :role="props.role"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.popover {
  position: relative;
  display: inline-flex;
}

.popover__panel {
  position: absolute;
  z-index: var(--z-popover);
  min-width: 160px;
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}

.popover__panel--start {
  left: 0;
}

.popover__panel--end {
  right: 0;
}

.popover-enter-active,
.popover-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
