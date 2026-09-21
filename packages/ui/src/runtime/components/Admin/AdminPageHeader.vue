<script lang="ts" setup>
import type { ButtonProps, PageHeaderProps } from '@nuxt/ui'
import { objectOmit } from '@vueuse/core'

type Props = PageHeaderProps & {
  returnButton?: ButtonProps | false
}
withDefaults(defineProps<Props>(), {
  returnButton: () => ({
    label: 'Admin',
    to: '/admin',
    icon: 'i-lucide-arrow-left',
    variant: 'link',
  }) as never,
})

const forwardedSlots = ['links', 'description']
</script>

<template>
  <UPageHeader
    v-bind="objectOmit($props, ['returnButton'])"
    :ui="{ headline: 'flex-1 p-0' }"
  >
    <!-- Manually handled slot -->
    <template #headline>
      <slot name="headline">
        <UButton
          v-if="returnButton !== false && returnButton !== undefined"
          class="p-0"
          v-bind="{ variant: 'link', ...returnButton }"
        />
      </slot>
    </template>

    <template
      v-for="slotName in forwardedSlots"
      :key="slotName"
      #[slotName]
    >
      <slot :name="slotName" />
    </template>
  </UPageHeader>
</template>
