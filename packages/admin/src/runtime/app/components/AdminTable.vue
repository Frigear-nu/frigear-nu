<!-- @deprecated: use `<TableCard><UTable :ui="tableUi()" … /></TableCard>` from @frigear-nu/ui -->
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
  <TableCard>
    <UTable
      :data="data"
      :columns="columns"
      :loading="loading"
      :ui="tableUi()"
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
        <UEmpty
          icon="i-lucide-inbox"
          :title="empty"
          variant="naked"
          class="py-10"
        />
      </template>
    </UTable>
  </TableCard>
</template>
