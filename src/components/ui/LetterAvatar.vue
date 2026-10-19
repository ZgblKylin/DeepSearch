<script setup lang="ts">
import { computed } from 'vue'

/**
 * 本地字母头像：取站点名/域名首字符 + 名称哈希色。
 * 不加载 site_icon 或任何第三方 favicon（PLAN 3.3）。
 */
const props = withDefaults(
  defineProps<{
    /** 站点名或域名 */
    name?: string
    /** 结果 URL，用于兜底取 host */
    url?: string
    /** 边长（px） */
    size?: number
  }>(),
  { name: '', url: '', size: 22 },
)

const host = computed(() => {
  if (!props.url) return ''
  try {
    return new URL(props.url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
})

const label = computed(() => props.name.trim() || host.value || '?')

const initial = computed(() => {
  const first = Array.from(label.value)[0] ?? '?'
  return first.toUpperCase()
})

const hue = computed(() => {
  const key = (props.name.trim() || host.value || '?').toLowerCase()
  let hash = 0
  for (const char of key) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360
  }
  return hash
})

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.max(10, Math.round(props.size * 0.44))}px`,
  backgroundColor: `hsl(${hue.value} 72% 91%)`,
  color: `hsl(${hue.value} 52% 30%)`,
}))
</script>

<template>
  <span class="letter-avatar" :style="style" :title="label" aria-hidden="true">
    {{ initial }}
  </span>
</template>

<style scoped>
.letter-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--radius-xs);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  user-select: none;
}
</style>
