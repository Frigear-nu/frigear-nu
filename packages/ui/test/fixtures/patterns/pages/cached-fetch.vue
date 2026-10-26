<script setup lang="ts">
const route = useRoute()
const fail = route.query.fail ? '?fail=1' : ''
const { data, error, loading } = await useCachedFetch<string[]>(`/api/cached${fail}`, { key: `cached${fail}`, ttl: 60_000 })
const items = computed(() => data.value ?? [])
</script>

<template>
  <div>
    <p v-if="loading">
      Loading items
    </p>
    <p v-else-if="error">
      Failed: {{ error.statusMessage }}
    </p>
    <p v-else-if="!items.length">
      No items
    </p>
    <ul v-else>
      <li
        v-for="item in items"
        :key="item"
      >
        {{ item }}
      </li>
    </ul>
  </div>
</template>
