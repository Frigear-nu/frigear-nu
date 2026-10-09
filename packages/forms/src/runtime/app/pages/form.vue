<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data: form } = await useForm(slug)

useHead({ title: computed(() => form.value?.name ?? '') })
</script>

<template>
  <UContainer class="max-w-2xl py-10">
    <h1
      v-if="form"
      class="mb-6 text-3xl font-bold"
    >
      {{ form.name }}
    </h1>
    <FormRenderer :slug="slug" />
  </UContainer>
</template>
