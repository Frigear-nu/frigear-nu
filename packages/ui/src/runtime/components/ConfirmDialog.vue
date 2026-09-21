<script lang="ts" setup>
interface ConfirmDialogProps {
  title?: string
  description?: string
  dismissible?: boolean
  confirmText?: string
}

withDefaults(defineProps<ConfirmDialogProps>(), {
  dismissible: false,
})

const emits = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="outline"
        @click="emits('close', false)"
      />
      <UButton
        :label="confirmText || 'Confirm'"
        color="neutral"
        @click="emits('close', true)"
      />
    </template>
  </UModal>
</template>
