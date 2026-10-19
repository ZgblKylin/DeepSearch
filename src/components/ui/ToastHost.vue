<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { useUi } from '@/stores/ui'

const { toast } = useUi()
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="toast.visible"
        class="toast"
        :class="`toast--${toast.kind}`"
        role="status"
        aria-live="polite"
      >
        <Icon
          :name="toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert-circle' : 'info'"
          :size="16"
        />
        <span class="toast__message">{{ toast.message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  z-index: var(--z-toast);
  top: calc(var(--topbar-height) + 12px);
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: min(92vw, 480px);
  padding: 9px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  color: var(--text);
  box-shadow: var(--shadow-md);
  font-size: var(--text-sm);
  transform: translateX(-50%);
}

.toast--success {
  color: var(--success);
  border-color: var(--success);
}

.toast--error {
  color: var(--danger);
  border-color: var(--danger);
}

.toast__message {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}

/* 移动端顶栏为两行（结果页），固定顶部会遮挡搜索框；改为底部固定（QA P3-2） */
@media (max-width: 768px) {
  .toast {
    top: auto;
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-4));
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: translate(-50%, 8px);
  }
}
</style>
