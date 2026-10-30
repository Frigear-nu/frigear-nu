<script setup lang="ts">
import { computed, ref } from '#imports'

const modelValue = defineModel<string>()
const $emits = defineEmits<{
  success: [string]
}>()

const errors = ref<string[]>([])

const model = computed<string | undefined>({
  get: () => modelValue.value,
  set: (value) => {
    modelValue.value = value
    errors.value = []
    if (!value) return
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      errors.value.push(
        'URL must start with http:// or https://',
      )
      return
    }

    $emits('success', value)
  },
})
</script>

<template>
  <UInput
    v-model="model"
    type="url"
    :errors="errors"
  />
</template>
