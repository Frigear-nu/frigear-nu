<script setup lang="ts" generic="T extends object">
import type { TableColumn, TableRow } from '@nuxt/ui'

defineProps<{
  data: T[]
  columns: TableColumn<T>[]
  loading?: boolean
  empty?: string
}>()
const emit = defineEmits<{ select: [e: Event, row: TableRow<T>] }>()
</script>

<template>
  <div class="border-default overflow-hidden rounded-lg border">
    <UTable
      :data="data"
      :columns="columns"
      :loading="loading"
      @select="(e: Event, row: TableRow<T>) => emit('select', e, row)"
    >
      <template
        v-for="(_, name) in $slots"
        #[name]="slotProps"
      >
        <slot
          :name="name"
          v-bind="slotProps ?? {}"
        />
      </template>
      <template
        v-if="empty && !$slots.empty"
        #empty
      >
        <AdminEmpty
          icon="i-lucide-inbox"
          :title="empty"
        />
      </template>
    </UTable>
  </div>
</template>
