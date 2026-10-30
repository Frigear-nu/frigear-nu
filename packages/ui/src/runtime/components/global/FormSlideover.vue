<script setup lang="ts">
import { computed, useUiT } from '#imports'
/**
 * A create/edit form in a slideover. The caller renders the form in the default slot as
 * `<UForm :id="formId" …>` (or `<form :id="formId" @submit.prevent>`); the footer holds Cancel and the submit
 * button, which submits that form through its `form` attribute.
 *
 * Open it with `useOverlay()`: wrap it in a component of your own whose root is `FormSlideover` and which emits
 * `close` with the saved record (Cancel emits `close(false)`), then
 * `const record = await overlay.create(MyFormSlideover).open(props).result`.
 */
const props = defineProps<{
  title: string
  description?: string
  formId: string
  submitLabel: string
  cancelLabel?: string
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  close: [value: false]
}>()

const open = defineModel<boolean>('open')

const actions = useUiT('actions')
const cancelText = computed(() => props.cancelLabel ?? actions('cancel', 'Cancel'))

function cancel() {
  open.value = false
  emit('close', false)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="description"
    :ui="{ footer: 'justify-end gap-2' }"
  >
    <template #body>
      <slot />
    </template>
    <template #footer>
      <slot
        name="footer"
        :cancel="cancel"
      >
        <UButton
          :label="cancelText"
          color="neutral"
          variant="outline"
          :disabled="loading"
          @click="cancel"
        />
        <UButton
          type="submit"
          :form="formId"
          :label="submitLabel"
          :loading="loading"
          :disabled="disabled"
        />
      </slot>
    </template>
  </USlideover>
</template>
