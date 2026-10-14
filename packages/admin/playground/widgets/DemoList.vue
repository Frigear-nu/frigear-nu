<script setup lang="ts">
defineProps<{ title: string, description?: string, rows: string[] }>()
</script>

<template>
  <AdminListCard
    :title="title"
    :description="description"
    :is-empty="!rows.length"
    empty="Nothing yet."
    to="/admin"
    to-label="View all"
  >
    <li
      v-for="row in rows"
      :key="row"
    >
      {{ row }}
    </li>
  </AdminListCard>
</template>
