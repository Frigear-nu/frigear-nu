<template>
  <div>
    Menus:
    <ul>
      <li
        v-for="item in items"
        :key="item.id"
      >
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
const { data: items } = useMenu('main')
</script>
