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
      <UPageHeader
        v-bind="data.pageHeader"
        :ui="{ root: 'text-center', wrapper: 'lg:flex-col lg:items-center lg:justify-center' }"
      />
    </UContainer>
    <UPageBody>
      <component
        :is="data?.container ? UContainer : 'div'"
        v-if="data"
      >
        <ContentRenderer :value="data" />
      </component>
    </UPageBody>
  </UPage>
</template>
