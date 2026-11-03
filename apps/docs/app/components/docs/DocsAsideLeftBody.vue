<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

// Overrides Docus' sidebar, which opens every group. Top-level groups (the module categories) stay open, but a
// module split into subpages folds unless the current page is in it, so the Modules tab stays short.
const { sidebarNavigation } = useSubNavigation()
const route = useRoute()

const contentNavVariants = useUIConfig('contentNavigation')

function contains(item: ContentNavigationItem, path: string): boolean {
  return item.path === path || !!item.children?.some(child => contains(child, path))
}

function foldNested(items: ContentNavigationItem[], depth = 0): ContentNavigationItem[] {
  return items.map((item) => {
    if (!item.children?.length) return item
    return {
      ...item,
      defaultOpen: depth === 0 || contains(item, route.path),
      children: foldNested(item.children, depth + 1),
    }
  })
}

const navigation = computed(() => foldNested(sidebarNavigation.value))
// `defaultOpen` only applies on mount: remount when the page changes so the current module opens.
const navigationKey = computed(() => route.path)
</script>

<template>
  <UContentNavigation
    :key="navigationKey"
    type="multiple"
    trailing-icon="i-lucide-chevron-right"
    :ui="{ linkTrailingIcon: 'group-data-[state=open]:rotate-90' }"
    :highlight="contentNavVariants.highlight ?? true"
    :highlight-color="contentNavVariants.highlightColor"
    :variant="contentNavVariants.variant ?? 'link'"
    :color="contentNavVariants.color"
    :navigation="navigation"
  />
</template>
