<script setup lang="ts">
/**
 * 开关控件（role="switch"），用于 AI 模式与设置项。
 * 支持 v-model；按钮天然支持键盘 Space/Enter。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /** 无障碍名称 */
    label?: string
    disabled?: boolean
  }>(),
  { label: '', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function toggle(): void {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="toggle-switch"
    :class="{ 'toggle-switch--on': props.modelValue }"
    role="switch"
    :aria-checked="props.modelValue"
    :aria-label="props.label || undefined"
    :disabled="props.disabled"
    @click="toggle"
  >
    <span class="toggle-switch__thumb" />
  </button>
</template>

<style scoped>
.toggle-switch {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  width: 36px;
  height: 20px;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  transition: background-color var(--transition-fast);
}

.toggle-switch--on {
  background: var(--brand);
}

.toggle-switch__thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast);
}

.toggle-switch--on .toggle-switch__thumb {
  transform: translateX(16px);
}
</style>
