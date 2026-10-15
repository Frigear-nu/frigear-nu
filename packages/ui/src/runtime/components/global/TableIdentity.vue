<script setup lang="ts">
import type { AvatarProps } from '@nuxt/ui'

/**
 * The first cell of a list row: the record's name with a muted second line (an email, a slug, a client id) and an
 * optional avatar. Badges that belong to the name (Admin, Draft) go in `#badges`.
 */
defineProps<{
  title: string
  description?: string | null
  /** Shows an avatar; `alt` alone renders initials. */
  avatar?: AvatarProps
}>()

defineSlots<{
  badges?: () => unknown
}>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-3">
    <UAvatar
      v-if="avatar"
      size="sm"
      v-bind="avatar"
    />
    <div class="flex min-w-0 flex-col">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-highlighted truncate font-medium">{{ title }}</span>
        <slot name="badges" />
      </div>
      <span
        v-if="description"
        class="text-muted truncate text-xs"
      >{{ description }}</span>
    </div>
  </div>
</template>
