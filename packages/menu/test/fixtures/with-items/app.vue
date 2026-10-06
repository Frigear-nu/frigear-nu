<template>
  <ul>
    <li
      v-for="item in main"
      :key="item.id"
    >
      {{ item.label }} -> {{ item.to }}
    </li>
  </ul>
  <ul>
    <li
      v-for="item in more"
      :key="item.id"
    >
      {{ item.label }} -> {{ item.to }}
    </li>
  </ul>
</template>

<script setup>
const { data: main } = useMenu('dashboard')
const { data: more } = useMenu('dashboard.more')
</script>
