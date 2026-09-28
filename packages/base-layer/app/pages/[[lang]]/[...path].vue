<script setup lang="ts">
const { data } = await useCurrentPage()

if (!data.value) {
  throw createError({ status: 404, message: 'Page not found' })
}
</script>

<template>
  <UPage>
    <LazyUPageHeader
      v-if="data && data.pageHeader"
      v-bind="data.pageHeader"
    />
    <LazyUPageBody>
      <LazyContentRenderer
        v-if="data"
        :value="data"
      />
    </LazyUPageBody>
  </UPage>
</template>
