<script setup lang="ts">
const tags = ref<string[]>(['example', 'tag'])
const url = ref('')
const toggle = ref(false)
const interval = ref(3600)
</script>

<template>
  <UContainer class="py-10 flex flex-col gap-6">
    <h1 class="text-2xl font-bold">
      @scrape-admin/ui playground
    </h1>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        Toggle
      </h2>
      <SwitchToggle v-model="toggle" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        TagInput
      </h2>
      <TagInput v-model="tags" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        UrlInput
      </h2>
      <UrlInput v-model="url" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        IntervalInput
      </h2>
      <IntervalInput v-model="interval" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        AppPageHeader
      </h2>
      <AppPageHeader
        title="Page Title"
        description="A sample page header"
        :return-button="false"
      />
    </div>
  </UContainer>
</template>
