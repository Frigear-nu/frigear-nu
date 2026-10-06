<template>
  <div>
    items:{{ items?.length ?? 0 }}
  </div>
</template>

<script setup>
const { data: items } = useMenu('main')
</script>
