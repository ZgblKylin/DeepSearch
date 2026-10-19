<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import ConnectionSection from '@/components/settings/ConnectionSection.vue'
import DangerSection from '@/components/settings/DangerSection.vue'
import EngineSection from '@/components/settings/EngineSection.vue'
import PreferencesSection from '@/components/settings/PreferencesSection.vue'
import UsageSection from '@/components/settings/UsageSection.vue'
import Icon from '@/components/ui/Icon.vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { useEscapeKey, useOutsideClick } from '@/composables/useOutsideClick'
import { useUi } from '@/stores/ui'

/**
 * 设置面板（PLAN 3.6）：
 * - 右侧悬浮面板 + 半透明遮罩，宽约 460px，移动端全屏；
 * - 点击外部、Esc、关闭按钮均可关闭；
 * - 分区：连接配置 / 搜索偏好 / 外部引擎 / 本机统计 / 危险操作。
 *
 * 无障碍（P3-3）：面板打开时启用焦点陷阱与 body 滚动锁定；
 * Key / 错误弹窗打开时暂时停用面板自身的焦点陷阱（避免与 BaseModal 嵌套陷阱冲突），
 * 但保持滚动锁定；关闭面板时恢复打开前的焦点与滚动状态。
 *
 * 所有设置项由各分区直接读写 `useSettings()`，修改即时持久化；
 * 分区在面板关闭时卸载，因此二次确认状态不会被保留。
 */
const { ui, closeSettings } = useUi()

const panelRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

/** 弹窗打开时禁用面板自身的“点击外部 / Esc / 焦点陷阱”，避免嵌套冲突 */
const panelInteractive = computed(
  () => ui.settingsOpen && !ui.apiKeyModal.open && !ui.errorModal.open,
)

useOutsideClick(panelRef, () => closeSettings(), { enabled: panelInteractive })
useEscapeKey(() => closeSettings(), { enabled: panelInteractive })

// Tab 在面板内循环；打开时聚焦面板容器，关闭时由下方 watch 归还焦点
useFocusTrap(panelRef, panelInteractive, {
  initialFocus: () => panelRef.value,
  restoreFocus: false,
})

// body 滚动锁定（与 BaseModal 相同的做法；嵌套弹窗会各自保存/恢复自己的状态）
let previousOverflow = ''
let scrollLocked = false

function lockBodyScroll(): void {
  if (typeof document === 'undefined' || scrollLocked) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  scrollLocked = true
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || !scrollLocked) return
  document.body.style.overflow = previousOverflow
  scrollLocked = false
}

watch(
  () => ui.settingsOpen,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      lockBodyScroll()
      return
    }
    unlockBodyScroll()
    const target = previouslyFocused
    previouslyFocused = null
    target?.focus?.()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  unlockBodyScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="settings">
      <div v-if="ui.settingsOpen" class="settings">
        <div class="settings__overlay" @click="closeSettings" />
        <aside
          ref="panelRef"
          class="settings__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-panel-title"
          tabindex="-1"
        >
          <header class="settings__header">
            <div class="settings__heading">
              <h2 id="settings-panel-title" class="settings__title">设置</h2>
              <p class="settings__subtitle">修改即时保存到本机浏览器</p>
            </div>
            <button type="button" class="icon-btn" aria-label="关闭设置" @click="closeSettings">
              <Icon name="x" :size="18" />
            </button>
          </header>

          <div class="settings__body">
            <ConnectionSection />
            <PreferencesSection />
            <EngineSection />
            <UsageSection />
            <DangerSection />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
}

.settings__overlay {
  position: absolute;
  inset: 0;
  background: var(--overlay);
}

.settings__panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(100%, 460px);
  border-left: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.settings__panel:focus {
  outline: none;
}

.settings__header {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5);
  border-bottom: 1px solid var(--border);
}

.settings__heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings__title {
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.3;
}

.settings__subtitle {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.settings__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 var(--space-5) var(--space-6);
  overscroll-behavior: contain;
}

/* ---- 分区共享样式（子组件使用以下类名） ---- */

.settings__body :deep(.settings-section) {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) 0;
  border-top: 1px solid var(--border);
}

.settings__body :deep(.settings-section:first-child) {
  padding-top: var(--space-5);
  border-top: none;
}

.settings__body :deep(.settings-section__head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.settings__body :deep(.settings-section__title) {
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.4;
}

.settings__body :deep(.settings-section__desc) {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.7;
}

.settings__body :deep(.settings-group) {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings__body :deep(.settings-label) {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.settings__body :deep(.settings-hint) {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.7;
}

.settings__body :deep(.settings-options) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.settings__body :deep(.settings-option) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: left;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.settings__body :deep(.settings-option:hover) {
  background: var(--surface-hover);
  color: var(--text);
}

.settings__body :deep(.settings-option[aria-pressed='true']) {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
}

.settings__body :deep(.settings-option__desc) {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 400;
}

.settings__body :deep(.settings-option[aria-pressed='true'] .settings-option__desc) {
  color: var(--brand);
}

.settings__body :deep(.settings-chips) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.settings__body :deep(.settings-chip) {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.settings__body :deep(.settings-chip:hover) {
  border-color: var(--border-strong);
  color: var(--text);
}

.settings__body :deep(.settings-chip[aria-pressed='true']) {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
}

.settings__body :deep(.settings-inline) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.settings__body :deep(.settings-status) {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.6;
}

.settings__body :deep(.settings-status--success) {
  color: var(--success);
}

.settings__body :deep(.settings-status--error) {
  color: var(--danger);
}

.settings__body :deep(.settings-confirm) {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
}

.settings__body :deep(.settings-confirm--warning) {
  border-color: var(--warning);
  background: var(--warning-soft);
}

.settings__body :deep(.settings-confirm__text) {
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.7;
}

.settings__body :deep(.settings-confirm__actions) {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* ---- 面板进出场 ---- */

.settings-enter-active,
.settings-leave-active {
  transition: opacity var(--transition-base);
}

.settings-enter-active .settings__panel,
.settings-leave-active .settings__panel {
  transition: transform var(--transition-base);
}

.settings-enter-from,
.settings-leave-to {
  opacity: 0;
}

.settings-enter-from .settings__panel,
.settings-leave-to .settings__panel {
  transform: translateX(24px);
}

@media (max-width: 768px) {
  .settings__panel {
    width: 100%;
    border-left: none;
  }
}
</style>
