<script setup lang="ts">
const { data: items } = useMenu('account')
const { data: dashboardItems } = useMenu('account.dropdown')
</script>

<template>
  <div>
    <h2>`account`</h2>
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
    <h2>`account.dropdown`</h2>
    <ul>
      <li
        v-for="item in dashboardItems"
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
