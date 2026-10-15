<script setup lang="ts">
const { data: items } = useMenu('account')
const { data: dropdownItems } = useMenu('account.dropdown')
</script>

<template>
  <UApp>
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
        v-for="item in dropdownItems"
        :key="item.id"
      >
        <NuxtLink :to="item.to">
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
    <AccountMenu />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
