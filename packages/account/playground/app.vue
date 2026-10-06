<script setup lang="ts">
const { data: items } = useMenu('dashboard')
</script>

<template>
  <div>
    <ul>
      <li
        v-for="item in items"
        :key="item.id"
      >
        <NuxtLink :to="item.to">
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
    <NuxtPage />
  </div>
</template>
