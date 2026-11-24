<script setup lang="ts">
import type { LayoutKey } from '#app'
import { computed, useDashboardNav, useHead, useModuleT } from '#imports'
import { useUserSession } from '#dashboard/optional'

// The signed-in hub inside the public site: the host's `default` layout (site header and footer) around
// `AreaNavLayout` (`@frigear-nu/ui`), the same frame as the account area. The navigation is the `dashboard` menu, where
// modules add their areas. Pages render their own heading. An app's own `layouts/dashboard.vue` replaces this one.
defineOptions({ name: 'DashboardLayout' })

// The host's site layout. Cast: whether a `default` layout exists depends on the app, not on this module.
const siteLayout = 'default' as unknown as LayoutKey

const t = useModuleT('dashboard')
const session = typeof useUserSession === 'function' ? useUserSession() : undefined
const { links, current } = await useDashboardNav()

const user = computed(() => {
  const value = session?.user.value as { name?: string | null, email?: string | null, avatar?: string | null } | null | undefined
  if (!value) return undefined
  const name = value.name || value.email || t('hub.title', 'Your dashboard')
  return {
    name,
    description: value.name ? value.email ?? undefined : undefined,
    avatar: { src: value.avatar || undefined, alt: name },
  }
})

// A default only: the page's own `useHead` title wins.
useHead({ title: () => current.value?.label ?? t('hub.title', 'Your dashboard') }, { tagPriority: 'low' })
</script>

<template>
  <NuxtLayout :name="siteLayout">
    <AreaNavLayout
      :links="links"
      :user="user"
      :label="t('nav.label', 'Dashboard navigation')"
    >
      <slot />
    </AreaNavLayout>
  </NuxtLayout>
</template>
