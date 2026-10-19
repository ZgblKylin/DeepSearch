<script setup lang="ts">
import { computed } from 'vue'

/**
 * 统一线性图标（24×24 stroke）。
 *
 * 可用名称见 ICONS；未知名称回退为问号图标。
 * 图标均为内联静态 SVG，不加载任何外部资源。
 */
const ICONS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.2-4.2" />',
  x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  close: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" />',
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C7 2 6 2 6 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 5 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />',
  moon: '<path d="M20.7 13.1A8.5 8.5 0 1 1 10.9 3.3a7 7 0 0 0 9.8 9.8Z" />',
  monitor:
    '<rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />',
  'chevron-down': '<path d="m6 9 6 6 6-6" />',
  'chevron-up': '<path d="m18 15-6-6-6 6" />',
  'chevron-left': '<path d="m15 18-6-6 6-6" />',
  'chevron-right': '<path d="m9 18 6-6-6-6" />',
  'arrow-right': '<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />',
  'arrow-left': '<path d="M19 12H5" /><path d="m11 18-6-6 6-6" />',
  'external-link':
    '<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />',
  'help-circle':
    '<circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.4 2.4 0 0 1 4.7.8c0 1.6-2.3 2-2.3 3.4" /><path d="M12 17h.01" />',
  help: '<circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.4 2.4 0 0 1 4.7.8c0 1.6-2.3 2-2.3 3.4" /><path d="M12 17h.01" />',
  sparkles:
    '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /><path d="M5 2l.7 1.8 1.8.7-1.8.7L5 7l-.7-1.8L2.5 4.5l1.8-.7L5 2Z" />',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
  check: '<path d="m5 12 4.5 4.5L19 7" />',
  trash:
    '<path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M6 6v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6" /><path d="M10 11v6" /><path d="M14 11v6" />',
  'refresh-cw':
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />',
  'alert-triangle':
    '<path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5" /><path d="M12 17h.01" />',
  'alert-circle':
    '<circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" />',
  loader: '<path d="M12 3a9 9 0 1 0 9 9" />',
  plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
  minus: '<path d="M5 12h14" />',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />',
  'eye-off':
    '<path d="m2 2 20 20" /><path d="M6.7 6.7C3.9 8.4 2 12 2 12s3.5 7 10 7c2 0 3.8-.7 5.3-1.7" /><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3.2 4.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />',
  filter: '<path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />',
  globe:
    '<circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" />',
  shield: '<path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-3Z" />',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />',
  'message-circle':
    '<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" />',
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
  clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />',
  zap: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />',
  key: '<circle cx="7.5" cy="15.5" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /><path d="m14 9 3 3" />',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />',
  sliders:
    '<path d="M4 6h10" /><path d="M18 6h2" /><path d="M4 12h4" /><path d="M12 12h8" /><path d="M4 18h12" /><path d="M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />',
  menu: '<path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" />',
}

const props = withDefaults(
  defineProps<{
    name: string
    /** 边长（px），默认 20 */
    size?: number | string
    strokeWidth?: number
  }>(),
  { size: 20, strokeWidth: 2 },
)

const markup = computed(() => ICONS[props.name] ?? ICONS['help-circle'])
</script>

<template>
  <svg
    class="icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="props.strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="markup"
  ></svg>
</template>
