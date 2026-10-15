<script setup lang="ts">
import { surfaceClass } from '../../utils/surface'

/**
 * A titled card for one section of a page (a form, key facts, a list). Header row with `title`/`description` (or
 * `#header`) and `#actions`, padded body (none with `flush`, e.g. for a table or list), optional `#footer`.
 */
defineProps<{
  title?: string
  description?: string
  icon?: string
  loading?: boolean
  /** Removes the body padding, for content that brings its own (tables, divided lists). */
  flush?: boolean
}>()
</script>

<template>
  <section :class="surfaceClass">
    <div
      v-if="title || description || $slots.header || $slots.actions"
      class="border-default flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5"
    >
      <slot name="header">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon
            v-if="icon"
            :name="icon"
            class="text-muted size-4 shrink-0"
          />
          <div class="min-w-0">
            <h2
              v-if="title"
              class="text-highlighted text-sm font-semibold"
            >
              {{ title }}
            </h2>
            <p
              v-if="description"
              class="text-muted text-sm"
            >
              {{ description }}
            </p>
          </div>
        </div>
      </slot>
      <div
        v-if="$slots.actions"
        class="flex items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
    <div
      v-if="loading"
      class="space-y-2 p-4"
    >
      <USkeleton class="h-5 w-1/2" />
      <USkeleton class="h-5 w-1/3" />
    </div>
    <div
      v-else
      :class="flush ? '' : 'p-4'"
    >
      <slot />
    </div>
    <div
      v-if="$slots.footer"
      class="border-default border-t px-4 py-3"
    >
      <slot name="footer" />
    </div>
  </section>
</template>
