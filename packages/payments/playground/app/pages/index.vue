<script setup lang="ts">
const { payments } = await usePayments()
</script>

<template>
  <UContainer class="py-10">
    <h1 class="text-2xl font-semibold">
      Payments playground
    </h1>
    <pre>{{ payments }}</pre>
  </UContainer>
</template>
