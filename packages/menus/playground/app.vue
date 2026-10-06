<script setup lang="ts">
const { data: items } = useMenu('main')
const { data: headerDropdown } = useMenu('header.dropdown')
</script>

<template>
  <div>
    Menus:

    Main Menu:
    <ul>
      <li
        v-for="item in items"
        :key="item.id"
      >
        {{ item.label }}
      </li>
    </ul>

    Header Dropdown Menu:
    <ul>
      <li
        v-for="item in headerDropdown"
        :key="item.id"
      >
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>
