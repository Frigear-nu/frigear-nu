<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { computed, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'FaqContactButton' })

// The built-in contact button of `FaqCard`: it opens a modal with a form of `@frigear-nu/forms` (the `contactForm` option,
// `contact` by default). Only rendered when forms is installed and the host sets no `contactComponent`. The form is not
// prefilled: use a `contactComponent` of your own for that.
const props = defineProps<ButtonProps & { initial?: Record<string, unknown> }>()

const t = useModuleT('faq')
const slug = useRuntimeConfig().public.faq?.contactForm || 'contact'
const buttonProps = computed<ButtonProps>(() => {
  const { initial: _initial, ...rest } = props
  return { ...rest, block: true, label: rest.label ?? t('contact', 'Contact us') }
})
</script>

<template>
  <UModal :title="buttonProps.label">
    <UButton v-bind="buttonProps" />
    <template #body>
      <FormRenderer :slug="slug" />
    </template>
  </UModal>
</template>
