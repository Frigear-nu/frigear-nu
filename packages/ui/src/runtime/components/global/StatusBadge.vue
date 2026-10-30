<script setup lang="ts">
import type { BadgeProps } from '@nuxt/ui'
import type { StatusColor } from '../../types'
import { statusColor } from '../../utils/status'
import { computed } from '#imports'

/**
 * A status as a subtle badge: `<StatusBadge :status="row.status" />`. The colour comes from `statusColor` (green
 * for done or live states, amber for states that need attention, red for failed, neutral otherwise); `colors`
 * overrides single statuses (`{ archived: 'warning' }`). `label` defaults to the status. Renders nothing when
 * there is neither a status nor a label.
 */
const props = defineProps<{
  status: string | null | undefined
  /** The text shown; defaults to `status`. Pass a translated label here. */
  label?: string
  /** Colour overrides keyed by lower-case status, on top of the defaults. */
  colors?: Record<string, StatusColor>
  size?: BadgeProps['size']
  icon?: string
}>()

const text = computed(() => props.label ?? props.status ?? '')
const color = computed(() => statusColor(props.status, props.colors))
</script>

<template>
  <UBadge
    v-if="text"
    variant="subtle"
    :color="color"
    :label="text"
    :icon="icon"
    :size="size"
  />
</template>
