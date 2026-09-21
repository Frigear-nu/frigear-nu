<script setup lang="ts">
const modelValue = defineModel<boolean>()
</script>

<template>
  <USwitch
    v-model="modelValue"
  />
</template>
