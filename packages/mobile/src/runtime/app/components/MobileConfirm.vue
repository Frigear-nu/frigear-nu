<script setup lang="ts">
// The web fallback of `useNative().confirm()` when `@frigear-nu/ui` is not installed. Cancel resolves `false`.
defineProps<{
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
}>()

const emit = defineEmits<{ close: [value: boolean] }>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="false"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="outline"
        @click="emit('close', false)"
      />
      <UButton
        :label="confirmLabel"
        :color="destructive ? 'error' : 'primary'"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
