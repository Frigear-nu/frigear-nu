<script setup lang="ts">
// Label/value list for key facts. Each item renders its value from the `#<key>` slot when given,
// otherwise `value`. Falsy values show an en dash.
export interface AdminKeyValueItem {
  key: string
  label: string
  value?: string | number | null
}

defineProps<{ items: AdminKeyValueItem[], loading?: boolean }>()
</script>

<template>
  <dl class="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
    <template
      v-for="item in items"
      :key="item.key"
    >
      <dt class="text-muted">
        {{ item.label }}
      </dt>
      <dd class="text-highlighted min-w-0 text-right wrap-break-word">
        <USkeleton
          v-if="loading"
          class="ml-auto h-4 w-24"
        />
        <slot
          v-else
          :name="item.key"
          :item="item"
        >
          {{ item.value ?? '–' }}
        </slot>
      </dd>
    </template>
  </dl>
</template>
