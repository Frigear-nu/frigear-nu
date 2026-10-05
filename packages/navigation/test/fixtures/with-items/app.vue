<template>
  <ul>
    <li
      v-for="item in useNavigation().value"
      :key="item.title"
    >
      {{ item.title }} -> {{ item.to }}
    </li>
  </ul>
  <ul>
    <li
      v-for="item in useNavigation('account.menu').value"
      :key="item.title"
    >
      {{ item.title }} -> {{ item.to }}
    </li>
  </ul>
</template>

<script setup>
</script>
