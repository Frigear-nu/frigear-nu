<template>
  <div>
    <ul>
      <li
        v-for="item in useNavigation().value"
        :key="item.title"
      >
        {{ item.title }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
</script>
