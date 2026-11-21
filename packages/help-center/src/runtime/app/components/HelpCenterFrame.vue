<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

defineOptions({ name: 'HelpCenterFrame' })

// The page frame of the two areas. The public area is a page of the site (`UContainer > UPage > UPageHeader`, inside the
// host's layout); the signed-in area is an app page (`PageHeading`, the account layout supplies the container). The
// `links` slot holds the buttons next to the title.
defineProps<{
  area: 'public' | 'signedIn'
  title?: string
  description?: string
  breadcrumb?: BreadcrumbItem[]
}>()

defineSlots<{
  default?: () => unknown
  links?: () => unknown
}>()
</script>

<template>
  <UContainer v-if="area === 'public'">
    <UPage>
      <UPageHeader
        :title="title"
        :description="description"
      >
        <template
          v-if="breadcrumb?.length"
          #headline
        >
          <UBreadcrumb :items="breadcrumb" />
        </template>
        <template
          v-if="$slots.links"
          #links
        >
          <slot name="links" />
        </template>
      </UPageHeader>
      <UPageBody>
        <slot />
      </UPageBody>
    </UPage>
  </UContainer>
  <div
    v-else
    class="flex flex-col gap-4"
  >
    <PageHeading
      :title="title"
      :description="description"
      :breadcrumb="breadcrumb"
    >
      <template
        v-if="$slots.links"
        #actions
      >
        <slot name="links" />
      </template>
    </PageHeading>
    <slot />
  </div>
</template>
