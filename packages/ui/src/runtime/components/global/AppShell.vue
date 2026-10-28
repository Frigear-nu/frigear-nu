<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AppShellProps } from '../../types'
import { useLocaleLink } from '../../composables/useLocaleLink'

/**
 * The dashboard shell of the app areas (admin, account): a collapsible, resizable sidebar with the brand, optional
 * ⌘K search, the navigation and a footer link, next to one panel whose navbar shows a muted eyebrow
 * (`title › section`, never a heading: pages render the one `<h1>` through `PageHeading`). The body is centred at
 * `max-w-7xl` unless `wide` (or `definePageMeta({ wide: true })`). Collapse and width persist per `id` in the
 * `dashboard-sidebar-<id>` cookie; on small screens the navbar opens the sidebar as a slideover, which closes on
 * navigation. Menus, identity and the account menu arrive through slots; `LanguageSelect` is shown on the right
 * when the app has one and more than one locale. Hosts can style the area through `[data-area=app]`.
 */
const props = defineProps<AppShellProps>()

defineSlots<{
  /** Replaces the brand link in the sidebar header. */
  'brand'?: (props: { collapsed: boolean }) => unknown
  /** Between the search button and the navigation. */
  'sidebar-top'?: (props: { collapsed: boolean }) => unknown
  /** Below the `backTo` link, e.g. the account menu. */
  'sidebar-footer'?: (props: { collapsed: boolean }) => unknown
  /** Replaces the navbar eyebrow (the collapse button stays). */
  'navbar-left'?: () => unknown
  /** Right side of the navbar; defaults to `LanguageSelect` when there is more than one locale. */
  'navbar-right'?: () => unknown
  'default'?: () => unknown
}>()

const route = useRoute()
const { localize } = useLocaleLink()

// Resolved by name so a host's own override wins and nothing is required; a name that doesn't resolve stays a string.
const resolvedLanguageSelect = resolveComponent('LanguageSelect')
const languageSelect = typeof resolvedLanguageSelect === 'string' ? undefined : resolvedLanguageSelect
const publicConfig = useRuntimeConfig().public as { multiLocale?: unknown }
const nuxtApp = useNuxtApp() as unknown as { $i18n?: { locales?: { value?: unknown[] } } }
const multiLocale = typeof publicConfig.multiLocale === 'boolean'
  ? publicConfig.multiLocale
  : (nuxtApp.$i18n?.locales?.value?.length ?? 0) > 1

// The section being viewed: the active navigation entry (or active child), if any.
const section = computed(() => {
  const items = props.navigation.flat().flatMap((item): NavigationMenuItem[] => [item, ...(item.children ?? [])])
  return items.find(item => item.type !== 'label' && item.active === true)?.label
})

// The eyebrow's second part, unless it would repeat the title.
const crumb = computed(() => section.value && section.value !== props.title ? section.value : undefined)

const isWide = computed(() => props.wide || route.meta.wide === true)

// A default only: a page's own `useHead` title wins.
useHead({ title: () => section.value ?? props.title }, { tagPriority: 'low' })
</script>

<template>
  <UDashboardGroup
    unit="rem"
    data-area="app"
    class="bg-default"
  >
    <UDashboardSidebar
      :id="id"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{
        header: 'border-b border-default',
        footer: 'border-t border-default flex-col items-stretch gap-1',
      }"
    >
      <template #header="{ collapsed }">
        <slot
          name="brand"
          :collapsed="collapsed"
        >
          <NuxtLink
            :to="localize(home)"
            :aria-label="collapsed ? title : undefined"
            class="flex min-w-0 items-center gap-2"
          >
            <span class="bg-primary text-inverted flex size-7 shrink-0 items-center justify-center rounded-lg">
              <UIcon
                :name="icon ?? 'i-lucide-layout-dashboard'"
                class="size-4"
              />
            </span>
            <span
              v-if="!collapsed"
              class="text-highlighted truncate font-semibold"
            >{{ title }}</span>
          </NuxtLink>
        </slot>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          v-if="searchGroups"
          :collapsed="collapsed"
          :label="searchLabel"
          class="bg-transparent ring-default"
        />

        <slot
          name="sidebar-top"
          :collapsed="collapsed"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigation"
          orientation="vertical"
          tooltip
          :aria-label="navLabel"
        />
      </template>

      <template
        v-if="backTo || $slots['sidebar-footer']"
        #footer="{ collapsed }"
      >
        <UButton
          v-if="backTo"
          :to="localize(backTo.to)"
          color="neutral"
          variant="ghost"
          :icon="backTo.icon ?? 'i-lucide-arrow-left'"
          :label="collapsed ? undefined : backTo.label"
          :aria-label="collapsed ? backTo.label : undefined"
          :square="collapsed"
          block
          class="justify-start"
        />
        <slot
          name="sidebar-footer"
          :collapsed="collapsed"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      v-if="searchGroups"
      :groups="searchGroups"
      :color-mode="false"
    />

    <UDashboardPanel :id="`${id}-main`">
      <template #header>
        <UDashboardNavbar
          class="bg-default/75 backdrop-blur"
          :ui="{ right: 'gap-2' }"
        >
          <template #left>
            <UDashboardSidebarCollapse />
            <slot name="navbar-left">
              <p
                data-slot="eyebrow"
                class="flex min-w-0 items-center gap-1.5 text-sm"
              >
                <span
                  class="truncate"
                  :class="crumb ? 'text-muted' : 'text-highlighted font-medium'"
                >{{ title }}</span>
                <template v-if="crumb">
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="text-dimmed size-4 shrink-0"
                  />
                  <span class="text-highlighted truncate font-medium">{{ crumb }}</span>
                </template>
              </p>
            </slot>
          </template>
          <template #right>
            <slot name="navbar-right">
              <component
                :is="languageSelect"
                v-if="languageSelect && multiLocale"
              />
            </slot>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div
          class="mx-auto w-full"
          :class="isWide ? '' : 'max-w-7xl'"
        >
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
