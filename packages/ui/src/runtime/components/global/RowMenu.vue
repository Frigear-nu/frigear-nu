<script setup lang="ts">
import type { ButtonProps, DropdownMenuItem } from '@nuxt/ui'
import { computed, useUiT } from '#imports'

/**
 * The `⋯` menu at the end of a table row or next to a heading. Order: Open, then edits, then the destructive action
 * in its own group. Stops the click so the row itself does not open.
 */
const props = withDefaults(defineProps<{
  items: DropdownMenuItem[] | DropdownMenuItem[][]
  /** What the menu acts on, for screen readers: "Actions for Spring meetup". */
  subject?: string
  variant?: 'ghost' | 'outline'
  size?: ButtonProps['size']
  /** Overrides the accessible name. */
  label?: string
}>(), {
  variant: 'ghost',
})

const t = useUiT('patterns')
const ariaLabel = computed(() => props.label
  ?? (props.subject ? t('actionsFor', 'Actions for {subject}', { subject: props.subject }) : t('moreActions', 'More actions')))
</script>

<template>
  <div
    class="flex justify-end"
    @click.stop
  >
    <UDropdownMenu
      :items="items"
      :content="{ align: 'end' }"
    >
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        :variant="variant"
        :size="size"
        :aria-label="ariaLabel"
      />
    </UDropdownMenu>
  </div>
</template>
