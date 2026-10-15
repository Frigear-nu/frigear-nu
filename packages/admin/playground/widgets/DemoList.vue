<script setup lang="ts">
defineProps<{ title: string, description?: string, rows: string[] }>()
</script>

<template>
  <ListCard
    :title="title"
    :description="description"
    :is-empty="!rows.length"
    empty="Nothing yet."
    to="/admin"
  >
    <li
      v-for="row in rows"
      :key="row"
    >
      {{ row }}
    </li>
  </ListCard>
</template>
