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
  <div class="h-dvh w-full overflow-hidden bg-default">
    <UDashboardGroup
      unit="rem"
      :ui="{ base: 'admin-group relative flex h-full w-full overflow-hidden' }"
    >
      <UDashboardSidebar
        v-model:open="sidebarOpen"
        :default-size="16"
        :min-size="12"
        :max-size="22"
        :ui="{ root: 'min-h-0', footer: 'border-t border-default' }"
      >
        <template #header>
          <NuxtLink
            :to="home"
            class="flex items-center gap-2 font-semibold"
          >
            <UIcon name="i-lucide-layout-dashboard" />
            <span>{{ t('title', 'Administration') }}</span>
          </NuxtLink>
        </template>

        <UNavigationMenu
          orientation="vertical"
          :items="links"
          :aria-label="t('nav.label', 'Admin navigation')"
        />

        <template #footer>
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            :label="t('backToSite', 'Back to the site')"
            block
          />
        </template>
      </UDashboardSidebar>

      <UDashboardPanel :ui="{ body: 'p-0 sm:p-0 gap-0' }">
        <template #header>
          <UDashboardNavbar :title="title">
            <template #leading>
              <UDashboardSidebarCollapse />
            </template>
            <template #right>
              <component
                :is="optional(LanguageSelect)"
                v-if="optional(LanguageSelect) && multiLocale"
              />
              <UColorModeButton />
              <component
                :is="optional(AccountMenu)"
                v-if="optional(AccountMenu)"
              />
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <UPage :ui="{ root: 'block', center: 'admin-content px-4 sm:px-6' }">
            <UPageBody class="mt-0 pt-6 pb-12 space-y-0">
              <slot />
            </UPageBody>
          </UPage>
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </div>
</template>
