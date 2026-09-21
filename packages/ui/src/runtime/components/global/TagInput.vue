<script setup lang="ts">
withDefaults(defineProps<{
  placeholder?: string
  searchPlaceholder?: string
  multiple?: boolean
}>(), {
  placeholder: 'Add tags...',
  searchPlaceholder: 'Type here to create a tag...',
  multiple: true,
})
const model = defineModel<string[]>({ default: () => [] })

// const searchTerm = ref('')

// function onCreateItem(value: string) {
//   const tag = value.trim()
//   if (!tag || model.value.includes(tag)) return
//
//   model.value = [...model.value, tag]
//   searchTerm.value = ''
// }
</script>

<template>
  <UInputTags
    v-model="model"
    :placeholder="placeholder"
  />
</template>
