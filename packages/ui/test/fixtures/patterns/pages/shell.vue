<script setup lang="ts">
defineOptions({ name: 'ShellPage' })

definePageMeta({ layout: 'shell' })
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      title="Shell page"
      description="A page inside the app shell"
    />
    <SectionCard title="Shell section">
      Shell body
    </SectionCard>
  </div>
</template>
