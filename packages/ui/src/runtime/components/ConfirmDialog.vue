<script lang="ts" setup>
import { useUiT } from '#imports'
// The modal behind `useConfirmDialog()`. Cancel resolves `false`, the confirm button `true`.
interface ConfirmDialogProps {
  title?: string
  description?: string
  dismissible?: boolean
  confirmText?: string
  cancelText?: string
  /** Styles the confirm button as destructive (red). */
  destructive?: boolean
}

withDefaults(defineProps<ConfirmDialogProps>(), {
  dismissible: false,
})

const emits = defineEmits<{
  close: [value: boolean]
}>()

const t = useUiT('patterns')
const actions = useUiT('actions')
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
        :label="cancelText || actions('cancel', 'Cancel')"
        color="neutral"
        variant="outline"
        @click="emits('close', false)"
      />
      <UButton
        :label="confirmText || t('confirm', 'Confirm')"
        :color="destructive ? 'error' : 'neutral'"
        @click="emits('close', true)"
      />
    </template>
  </UModal>
</template>
