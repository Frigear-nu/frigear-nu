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
  </div>
</template>
