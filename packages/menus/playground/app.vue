<script setup lang="ts">
const { data: items } = useMenu('account')
const { data: headerDropdown } = useMenu('account.dropdown')
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
