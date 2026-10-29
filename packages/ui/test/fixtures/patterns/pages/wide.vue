<script setup lang="ts">
defineOptions({ name: 'WidePage' })

definePageMeta({ layout: 'shell', wide: true })

useHead({ title: 'Wide page' })
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading title="Wide page" />
    <SectionCard title="Wide section">
      Wide body
    </SectionCard>
  </div>
</template>
