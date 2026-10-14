<script setup lang="ts">
defineOptions({ name: 'AdminLayout' })

const t = useModuleT('admin')
const route = useRoute()
const config = useRuntimeConfig().public.admin
// The same header controls as the site, resolved by name so a host's own overrides win and nothing is required:
// `LanguageSelect` (base layer), `AccountMenu` (@frigear-nu/account). A name that doesn't resolve stays a string.
const LanguageSelect = resolveComponent('LanguageSelect')
const AccountMenu = resolveComponent('AccountMenu')
const optional = (component: unknown) => typeof component === 'string' ? undefined : component
const nuxtApp = useNuxtApp() as { $i18n?: { locales?: { value?: unknown[] } } }
const multiLocale = (nuxtApp.$i18n?.locales?.value?.length ?? 0) > 1
const { data: items } = await useMenu('admin.nav')

const home = config?.dashboard ?? config?.base ?? '/admin'

const stripLocale = (path: string) => {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  const first = trimmed.split('/')[1]
  const codes = (nuxtApp.$i18n?.locales?.value ?? []).map(l => typeof l === 'string' ? l : (l as { code: string }).code)
  return first && codes.includes(first) ? (trimmed.slice(first.length + 1) || '/') : trimmed
}

const links = computed(() => (items.value ?? []).map(item => ({
  label: item.label,
  icon: item.icon,
  to: item.to,
  external: item.external,
  // The dashboard lives at the base itself, so it only matches exactly (ignoring a locale prefix).
  active: !!item.to && (item.to === home
    ? stripLocale(route.path) === home
    : route.path === item.to || route.path.startsWith(`${item.to}/`)),
})))

// The header names the section being viewed: the nav entry the route belongs to, else the area itself.
const title = computed(() => links.value.find(link => link.active)?.label ?? t('title', 'Administration'))

const sidebarOpen = ref(false)
watch(() => route.path, () => {
  sidebarOpen.value = false
})
</script>

<template>
  <div class="bg-muted dark:bg-default h-dvh w-full overflow-hidden">
    <UDashboardGroup
      unit="rem"
      :ui="{ base: 'admin-group relative flex h-full w-full overflow-hidden' }"
    >
      <UDashboardSidebar
        v-model:open="sidebarOpen"
        :default-size="15"
        :min-size="12"
        :max-size="20"
        :ui="{
          root: 'min-h-0 bg-default border-e border-default',
          header: 'h-auto px-4 pt-5 pb-3 flex-col items-start gap-0.5',
          body: 'px-3 py-2',
          footer: 'border-t border-default px-3 py-2',
        }"
      >
        <template #header>
          <NuxtLink
            :to="home"
            class="flex items-center gap-2.5"
          >
            <span class="bg-primary text-inverted flex size-8 items-center justify-center rounded-lg">
              <UIcon
                name="i-lucide-layout-dashboard"
                class="size-4.5"
              />
            </span>
            <span class="text-highlighted text-base font-semibold tracking-tight">{{ t('title', 'Administration') }}</span>
          </NuxtLink>
        </template>

        <UNavigationMenu
          orientation="vertical"
          :items="links"
          :aria-label="t('nav.label', 'Admin navigation')"
          :ui="{
            list: 'space-y-0.5',
            link: 'rounded-lg px-2.5 py-1.5 text-sm before:rounded-lg aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary aria-[current=page]:font-medium',
            linkLeadingIcon: 'size-4.5',
          }"
        />

        <template #footer>
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-arrow-left"
            :label="t('backToSite', 'Back to the site')"
            block
            class="justify-start"
          />
        </template>
      </UDashboardSidebar>

      <UDashboardPanel :ui="{ root: 'bg-muted dark:bg-default', body: 'p-0 sm:p-0 gap-0' }">
        <template #header>
          <UDashboardNavbar
            :ui="{ root: 'bg-default border-b border-default h-12 px-4 sm:px-6' }"
          >
            <template #leading>
              <UDashboardSidebarCollapse
                color="neutral"
                variant="ghost"
              />
              <span class="text-muted hidden text-sm sm:inline">{{ t('title', 'Administration') }}</span>
              <UIcon
                name="i-lucide-chevron-right"
                class="text-dimmed hidden size-3.5 sm:inline"
              />
              <span class="text-highlighted text-sm font-medium">{{ title }}</span>
            </template>
            <template #right>
              <component
                :is="optional(LanguageSelect)"
                v-if="optional(LanguageSelect) && multiLocale"
              />
              <UColorModeButton
                color="neutral"
                variant="ghost"
              />
              <component
                :is="optional(AccountMenu)"
                v-if="optional(AccountMenu)"
              />
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <div class="admin-content mx-auto w-full max-w-7xl px-4 pt-6 pb-12 sm:px-6">
            <slot />
          </div>
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </div>
</template>
