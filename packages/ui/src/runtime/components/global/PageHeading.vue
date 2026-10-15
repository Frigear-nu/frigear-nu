<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

/**
 * The title block of an app page: breadcrumb (or a muted eyebrow line) above, the title with an optional `#badge`,
 * the description, a meta row (default slot) and right-aligned `#actions`. Detail pages pass a breadcrumb array
 * so the parent list is one click away.
 */
defineProps<{
  title?: string
  description?: string
  /** A muted line above the title, or links back up the hierarchy. */
  breadcrumb?: string | BreadcrumbItem[]
}>()

defineSlots<{
  title?: () => unknown
  badge?: () => unknown
  description?: () => unknown
  default?: () => unknown
  actions?: () => unknown
}>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0 flex-1 basis-72 space-y-1">
      <UBreadcrumb
        v-if="Array.isArray(breadcrumb) && breadcrumb.length"
        :items="breadcrumb"
      />
      <p
        v-else-if="typeof breadcrumb === 'string' && breadcrumb"
        class="text-muted truncate text-sm"
      >
        {{ breadcrumb }}
      </p>
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h1 class="text-highlighted text-xl font-semibold tracking-tight text-pretty sm:text-2xl">
          <slot name="title">
            {{ title }}
          </slot>
        </h1>
        <slot name="badge" />
      </div>
      <p
        v-if="description || $slots.description"
        class="text-muted text-sm text-pretty"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </p>
      <div
        v-if="$slots.default"
        class="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm"
      >
        <slot />
      </div>
    </div>
    <div
      v-if="$slots.actions"
      class="flex flex-wrap items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
