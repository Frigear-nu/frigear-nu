<script setup lang="ts">
import { surfaceClass } from '#imports'

/**
 * A call to action: title, description, a tinted icon and one primary button that links to `to` or emits `action`.
 * Name the object in `actionLabel` ("Apply for a shift", not "Apply").
 */
defineProps<{
  title: string
  description?: string
  icon?: string
  actionLabel: string
  to?: string
  loading?: boolean
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <section :class="[surfaceClass, 'flex h-full flex-col gap-3 p-4']">
    <div class="flex items-start gap-3">
      <span
        v-if="icon"
        class="bg-primary/10 ring-primary/25 text-primary flex shrink-0 items-center justify-center rounded-full p-2.5 ring ring-inset"
      >
        <UIcon
          :name="icon"
          class="size-5"
        />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 class="text-highlighted text-sm font-semibold">
          {{ title }}
        </h2>
        <div
          v-if="loading"
          class="space-y-2"
        >
          <USkeleton class="h-4 w-3/4" />
        </div>
        <p
          v-else-if="description"
          class="text-muted text-sm"
        >
          {{ description }}
        </p>
      </div>
    </div>
    <div class="mt-auto">
      <UButton
        :to="to"
        :label="actionLabel"
        :disabled="loading"
        trailing-icon="i-lucide-arrow-right"
        @click="emit('action')"
      />
    </div>
  </section>
</template>
