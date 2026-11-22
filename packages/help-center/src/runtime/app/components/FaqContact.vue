<script setup lang="ts">
import { resolveComponent, useRuntimeConfig } from '#imports'

defineOptions({ name: 'FaqContact' })

// A contact button in an article's text: `::faq-contact{label="Contact us" :initial='{"subject":"other"}'}`. In a
// `cards` category it becomes the card's contact button (`FaqCard`'s `contact`, see `splitFaqBody`); anywhere else it
// renders on its own. Like the card's, it is the host's `faq.contactComponent`, else the built-in button that opens a form
// of `@frigear-nu/forms`, else nothing.
const props = defineProps<{
  label?: string
  initial?: Record<string, unknown>
}>()

const config = useRuntimeConfig().public.helpCenter?.faq
const contactName = config?.contactComponent || undefined
const contactComponent = contactName ? resolveComponent(contactName) : undefined
const hostContact = typeof contactComponent === 'string' ? undefined : contactComponent
const builtInContact = !contactName && !!config?.forms
</script>

<template>
  <div
    v-if="hostContact || builtInContact"
    class="not-prose my-4"
    data-test="faq-contact"
  >
    <component
      :is="hostContact"
      v-if="hostContact"
      :label="props.label"
      :initial="props.initial"
    />
    <FaqContactButton
      v-else
      :label="props.label"
      :initial="props.initial"
    />
  </div>
</template>
