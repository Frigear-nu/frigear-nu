<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { ContactFormSchema } from '#shared/schema/forms/contact'

const props = withDefaults(defineProps<{
  button?: ButtonProps
  title?: string
  label?: string
  initial?: ContactFormSchema
}>(), {
  button: undefined,
  title: 'contact.modal.title',
  label: undefined,
})

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()

const buttonProps = computed<ButtonProps>(() => {
  if (!props.button) {
    return {
      icon: 'i-lucide-mail',
      label: props.label || t('contact.modal.button'),
      class: 'w-full',
    }
  }

  return {
    // defaults in case the button is partially overridden
    label: props.label || t('contact.modal.button'),
    icon: 'i-lucide-mail',
    ...props.button,
  }
})
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="$t(title)"
  >
    <slot v-bind="{ button: buttonProps, isOpen }">
      <UButton
        v-bind="buttonProps"
      >
        <slot
          v-if="$slots.label"
          name="label"
        />
      </UButton>
    </slot>
    <template #body>
      <SiteContactForm
        :initial="initial"
        mode="slim"
        @success="isOpen = false"
      />
    </template>
  </UModal>
</template>
