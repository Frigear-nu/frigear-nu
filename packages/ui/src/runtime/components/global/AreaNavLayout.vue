<script setup lang="ts">
import type { AvatarProps, NavigationMenuItem } from '@nuxt/ui'
import { computed, useUiT } from '#imports'

/**
 * The body of a signed-in area inside the public site (the account area, the dashboard hub): a centred grid with a
 * sticky left column (an optional user block and the area's vertical navigation) on wide screens, and a
 * `PageSectionSwitcher` above the content on narrow screens. A layout wraps it in the host's `default` layout and passes
 * `links` ready for `UNavigationMenu` (`useNavLinks`). Pages render their own heading.
 */
const props = defineProps<{
  links: NavigationMenuItem[]
  /** The signed-in user shown above the navigation. The `aside-top` slot replaces it. */
  user?: { name: string, description?: string, avatar?: AvatarProps }
  /** Accessible name of the navigation and the section switcher. Default: "Sections". */
  label?: string
}>()

defineSlots<{
  'aside-top'?: () => unknown
  'default'?: () => unknown
}>()

const t = useUiT('patterns')
const navLabel = computed(() => props.label ?? t('sections', 'Sections'))
</script>

<template>
  <UContainer>
    <div class="mx-auto w-full max-w-5xl py-8 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside class="hidden lg:block">
        <div class="sticky top-[calc(var(--ui-header-height,4rem)+2.5rem)] flex flex-col gap-4">
          <slot name="aside-top">
            <UUser
              v-if="user"
              :name="user.name"
              :description="user.description"
              :avatar="user.avatar"
              size="sm"
              class="px-2.5"
              :ui="{ name: 'truncate', description: 'truncate' }"
            />
          </slot>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
            highlight
            :aria-label="navLabel"
          />
        </div>
      </aside>

      <!-- `self-start`: a stretched grid item has a definite height, which `h-full` cards inside a page would fill. -->
      <div class="flex min-w-0 flex-col gap-4 lg:self-start">
        <PageSectionSwitcher
          v-if="links.length"
          class="mb-2 lg:hidden"
          :items="links"
          :label="navLabel"
        />
        <slot />
      </div>
    </div>
  </UContainer>
</template>
