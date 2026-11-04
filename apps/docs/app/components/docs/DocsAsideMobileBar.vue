<script setup lang="ts">
import type { ContentTocLink } from '@nuxt/ui'

// Overrides Docus' mobile bar (Docus 5.15), whose "On this page" drawer stays open after a heading is picked. On
// iOS the drawer's scroll lock also restores the old scroll position when it closes, so the jump never lands.
// Close the drawer first, then scroll once it has finished closing. The menu drawer closes on navigation.
defineProps<{
  links?: ContentTocLink[]
}>()

const { sidebarNavigation, currentSection } = useSubNavigation()
const { t } = useDocusI18n()
const route = useRoute()

const contentNavVariants = useUIConfig('contentNavigation')
const contentTocVariants = useUIConfig('contentToc')

const menuDrawerOpen = ref(false)
const tocDrawerOpen = ref(false)

// The drawer's close animation; scrolling before it ends gets undone by the scroll lock.
const DRAWER_CLOSE_MS = 400
let pendingHeading: string | undefined

function onTocMove(id: string) {
  pendingHeading = id
  tocDrawerOpen.value = false
}

watch(tocDrawerOpen, (open) => {
  if (open || !pendingHeading) return
  const id = pendingHeading
  pendingHeading = undefined
  // UContentToc has already pushed the hash; headings carry a scroll-margin for the sticky header.
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, DRAWER_CLOSE_MS)
})

watch(() => route.path, () => {
  menuDrawerOpen.value = false
  tocDrawerOpen.value = false
})
</script>

<template>
  <div
    class="lg:hidden sticky top-(--ui-header-height) z-10 bg-default/75 backdrop-blur -mx-4 p-2 border-b border-dashed border-default flex justify-between"
  >
    <UDrawer
      v-model:open="menuDrawerOpen"
      direction="left"
      :title="currentSection?.title"
      :handle="false"
      inset
      side="left"
      :ui="{ content: 'w-full max-w-2/3' }"
    >
      <UButton
        :label="t('docs.menu')"
        icon="i-lucide-text-align-start"
        color="neutral"
        variant="ghost"
        square
        :aria-label="t('docs.menu')"
      />

      <template #body>
        <UContentNavigation
          :navigation="sidebarNavigation"
          :highlight="contentNavVariants.highlight ?? true"
          :highlight-color="contentNavVariants.highlightColor"
          :variant="contentNavVariants.variant ?? 'link'"
          :color="contentNavVariants.color"
          default-open
          trailing-icon="i-lucide-chevron-right"
          :ui="{ linkTrailingIcon: 'group-data-[state=open]:rotate-90' }"
        />
      </template>
    </UDrawer>

    <UDrawer
      v-model:open="tocDrawerOpen"
      direction="right"
      :handle="false"
      inset
      side="right"
      no-body-styles
      :ui="{ content: 'w-full max-w-2/3' }"
    >
      <UButton
        :label="t('docs.toc')"
        trailing-icon="i-lucide-chevron-right"
        color="neutral"
        variant="link"
        square
        :aria-label="t('docs.toc')"
      />

      <template #body>
        <UContentToc
          v-if="links?.length"
          :highlight="contentTocVariants.highlight ?? true"
          :highlight-color="contentTocVariants.highlightColor"
          :highlight-variant="contentTocVariants.highlightVariant ?? 'circuit'"
          :color="contentTocVariants.color"
          :links="links"
          :open="true"
          default-open
          :ui="{
            root: '!mx-0 !px-1 top-0 overflow-visible',
            container: '!pt-0 border-b-0',
            trailingIcon: 'hidden',
            bottom: 'flex flex-col',
          }"
          @move="onTocMove"
        >
          <template #bottom>
            <DocsAsideRightBottom />
          </template>
        </UContentToc>
      </template>
    </UDrawer>
  </div>
</template>
