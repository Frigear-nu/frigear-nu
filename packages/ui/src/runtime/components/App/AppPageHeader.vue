<script lang="ts" setup>
import type { ButtonProps, PageHeaderProps, BreadcrumbItem } from '@nuxt/ui'
import { objectOmit } from '@vueuse/core'
import defu from 'defu'

type Props = PageHeaderProps & {
  returnButton?: ButtonProps | false
  crumbs?: BreadcrumbItem[]
}
withDefaults(defineProps<Props>(), {
  returnButton: () => ({
    label: 'Dashboard',
    to: '/app',
    icon: 'i-lucide-arrow-left',
    variant: 'link',
  }) as never,
  crumbs: () => [],
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
        <div class="flex items-center gap-2">
          <UButton
            v-if="returnButton !== false && returnButton !== undefined"
            class="p-0"
            v-bind="defu(returnButton, { variant: 'link' }) as ButtonProps"
          />
          <UIcon
            v-if="crumbs && crumbs.length > 0"
            name="i-lucide-chevron-right"
          />
          <UBreadcrumb
            v-if="crumbs && crumbs.length > 0"
            :items="crumbs"
            label-key="label"
          />
        </div>
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
