<script setup lang="ts">
defineOptions({ name: 'PatternsTablePage' })

const page = ref(2)
const pageSize = ref(20)
</script>

<template>
  <div class="flex flex-col gap-4">
    <TableCard refreshing>
      <TableIdentity
        title="Ada Lovelace"
        description="ada@example.com"
        :avatar="{ alt: 'Ada Lovelace' }"
      />
      <template #footer>
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="132"
        />
      </template>
    </TableCard>
    <TableCard>
      <template #footer>
        <TablePagination :total="3" />
      </template>
    </TableCard>
    <TableCard
      title="Recent payments"
      description="Last thirty days"
    >
      <template #actions>
        <UButton label="Export payments" />
      </template>
      <span>titled-table-body</span>
    </TableCard>
    <div class="flex gap-2">
      <StatusBadge status="published" />
      <StatusBadge
        status="pending"
        label="Awaiting review"
      />
      <StatusBadge status="failed" />
      <StatusBadge status="draft" />
      <StatusBadge
        status="archived"
        :colors="{ archived: 'warning' }"
      />
      <StatusBadge status="" />
    </div>
  </div>
</template>
