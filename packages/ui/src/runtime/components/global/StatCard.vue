<script setup lang="ts">
import { surfaceClass } from '../../utils/surface'

/**
 * A number with a label (and an optional tinted icon and hint). Links to the list it summarises when `to` is set.
 * The default slot replaces `value`; `empty` shows when there is neither.
 */
defineProps<{
  label: string
  value?: string | number
  hint?: string
  icon?: string
  to?: string
  loading?: boolean
  empty?: string
}>()

const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="to ? NuxtLink : 'section'"
    :to="to"
    :class="[surfaceClass, 'flex h-full items-start gap-3 p-4', to && 'hover:bg-elevated hover:ring-accented transition-colors focus-visible:outline-2 focus-visible:outline-primary']"
  >
    <span
      v-if="icon"
      class="bg-primary/10 ring-primary/25 text-primary flex shrink-0 items-center justify-center rounded-full p-2.5 ring ring-inset"
    >
      <UIcon
        :name="icon"
        class="size-5"
      />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <h2 class="text-muted text-xs font-normal uppercase">
        {{ label }}
      </h2>
      <div
        v-if="loading"
        class="space-y-2"
      >
        <USkeleton class="h-5 w-2/3" />
        <USkeleton class="h-4 w-1/3" />
      </div>
      <template v-else-if="$slots.default || (value !== undefined && value !== null && value !== '')">
        <div class="text-highlighted flex flex-wrap items-center gap-2 text-lg font-semibold tabular-nums">
          <slot>
            {{ value }}
          </slot>
        </div>
        <p
          v-if="hint"
          class="text-muted text-sm"
        >
          {{ hint }}
        </p>
      </template>
      <p
        v-else
        class="text-muted text-sm"
      >
        {{ empty }}
      </p>
    </div>
  </component>
</template>
