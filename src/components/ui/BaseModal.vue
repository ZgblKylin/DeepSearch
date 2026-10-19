<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import { useFocusTrap } from '@/composables/useFocusTrap'

/**
 * 通用弹窗：Teleport 到 body、遮罩、焦点陷阱、Esc / 点击外部关闭、滚动锁定。
 *
 * 使用方（ApiKeyModal / ErrorModal）通过 `title` 或 header 插槽提供标题，
 * 默认插槽放正文，footer 插槽放操作按钮。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    /** 标题（若使用 header 插槽则忽略） */
    title?: string
    subtitle?: string
    size?: 'sm' | 'md' | 'lg'
    /** 点击遮罩是否关闭，默认 true */
    closeOnOverlay?: boolean
    /** 是否显示右上角关闭按钮，默认 true */
    showClose?: boolean
    /** 无 title 时的无障碍名称 */
    ariaLabel?: string
    /**
     * 打开后优先聚焦的元素：CSS selector 或已解析的 HTMLElement。
     * 缺省 / 未匹配时保持原有行为（聚焦面板内首个可聚焦元素）。
     * 注意：传入元素 ref 时请使用其解引用后的 DOM 元素。
     */
    initialFocus?: string | HTMLElement
  }>(),
  {
    title: '',
    subtitle: '',
    size: 'md',
    closeOnOverlay: true,
    showClose: true,
    ariaLabel: '',
    initialFocus: undefined,
  },
)

const emit = defineEmits<{ close: [] }>()

const panelRef = ref<HTMLElement | null>(null)
const active = toRef(props, 'open')
const titleId = `base-modal-title-${Math.random().toString(36).slice(2, 10)}`

const labelledBy = computed(() => (props.title ? titleId : undefined))

/**
 * 解析 initialFocus：
 * - 元素：直接使用；
 * - selector：优先在面板内查找，再退回 document（兼容 Teleport 场景）；
 * - 未提供 / 未匹配：返回 null，由 useFocusTrap 回退到首个可聚焦元素。
 */
function resolveInitialFocus(): HTMLElement | null {
  const target = props.initialFocus
  if (!target) return null
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target
  }
  if (typeof target !== 'string') return null
  try {
    const scoped = panelRef.value?.querySelector<HTMLElement>(target)
    if (scoped) return scoped
    if (typeof document !== 'undefined') return document.querySelector<HTMLElement>(target)
  } catch {
    // 非法 selector 时保持默认行为
  }
  return null
}

useFocusTrap(panelRef, active, {
  onEscape: () => emit('close'),
  initialFocus: resolveInitialFocus,
})

let previousOverflow = ''
let scrollLocked = false

watch(
  active,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      scrollLocked = true
    } else if (scrollLocked) {
      document.body.style.overflow = previousOverflow
      scrollLocked = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined' && scrollLocked) {
    document.body.style.overflow = previousOverflow
    scrollLocked = false
  }
})

function handleOverlayClick(): void {
  if (props.closeOnOverlay) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="props.open" class="modal">
        <div class="modal__overlay" @click="handleOverlayClick" />
        <div
          ref="panelRef"
          class="modal__panel"
          :class="`modal__panel--${props.size}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          :aria-label="labelledBy ? undefined : props.ariaLabel || undefined"
          tabindex="-1"
        >
          <header v-if="props.title || props.subtitle || $slots.header" class="modal__header">
            <slot name="header">
              <h2 v-if="props.title" :id="titleId" class="modal__title">{{ props.title }}</h2>
              <p v-if="props.subtitle" class="modal__subtitle">{{ props.subtitle }}</p>
            </slot>
            <button
              v-if="props.showClose"
              type="button"
              class="icon-btn modal__close"
              aria-label="关闭"
              @click="emit('close')"
            >
              <Icon name="x" :size="18" />
            </button>
          </header>
          <div class="modal__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

.modal__overlay {
  position: absolute;
  inset: 0;
  background: var(--overlay);
}

.modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100%, 520px);
  max-height: min(86vh, 900px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.modal__panel--sm {
  width: min(100%, 380px);
}

.modal__panel--md {
  width: min(100%, 520px);
}

.modal__panel--lg {
  width: min(100%, 680px);
}

.modal__header {
  position: relative;
  flex: none;
  padding: var(--space-5) var(--space-6) 0;
  padding-right: 56px;
}

.modal__title {
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.4;
}

.modal__subtitle {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.modal__close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
}

.modal__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-5) var(--space-6);
}

.modal__footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: 0 var(--space-6) var(--space-5);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-base);
}

.modal-enter-active .modal__panel,
.modal-leave-active .modal__panel {
  transition:
    opacity var(--transition-base),
    transform var(--transition-base);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal__panel,
.modal-leave-to .modal__panel {
  opacity: 0;
  transform: translateY(12px) scale(0.985);
}

@media (max-width: 480px) {
  .modal {
    align-items: flex-end;
    padding: 0;
  }

  .modal__panel {
    width: 100%;
    max-height: 92vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
