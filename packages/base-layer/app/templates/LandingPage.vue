<script setup lang="ts">
const { data } = await useCurrentPage()
if (!data.value) {
  throw createError({ status: 404, message: 'Page not found' })
}
</script>

<template>
  <ContentRenderer
    v-if="data"
    :value="data"
  />
</template>
