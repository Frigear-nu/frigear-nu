<!-- @deprecated: use PageHeading from @frigear-nu/ui (`back` becomes `breadcrumb`, `#links` becomes `#actions`) -->
<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const props = defineProps<{
  title?: string
  description?: string
  back?: { label: string, to: string }
}>()

const breadcrumb = computed<BreadcrumbItem[] | undefined>(() => props.back
  ? [{ label: props.back.label, to: props.back.to }, ...(props.title ? [{ label: props.title }] : [])]
  : undefined)
</script>

<template>
  <PageHeading
    :title="title"
    :description="description"
    :breadcrumb="breadcrumb"
  >
    <template
      v-if="$slots.title"
      #title
    >
      <slot name="title" />
    </template>
    <template
      v-if="$slots.description"
      #description
    >
      <slot name="description" />
    </template>
    <template
      v-if="$slots.default"
      #default
    >
      <slot />
    </template>
    <template
      v-if="$slots.links || $slots.actions"
      #actions
    >
      <slot name="links">
        <slot name="actions" />
      </slot>
    </template>
  </PageHeading>
</template>
