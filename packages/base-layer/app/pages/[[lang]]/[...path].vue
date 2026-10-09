<script setup lang="ts">
import { UContainer } from '#components'

const { data } = await useCurrentPage()

if (!data.value) {
  throw createError({ status: 404, message: 'Page not found' })
}
</script>

<template>
  <UPage>
    <UContainer v-if="data && data.pageHeader">
      <LazyUPageHeader
        v-bind="data.pageHeader"
        :ui="{ root: 'text-center', wrapper: 'lg:flex-col lg:items-center lg:justify-center' }"
      />
    </UContainer>
    <LazyUPageBody>
      <component
        :is="data?.container ? UContainer : 'div'"
        v-if="data"
      >
        <LazyContentRenderer :value="data" />
      </component>
    </LazyUPageBody>
  </UPage>
</template>
