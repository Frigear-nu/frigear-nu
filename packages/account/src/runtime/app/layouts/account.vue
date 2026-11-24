<script setup lang="ts">
import type { LayoutKey } from '#app'
import { computed, useAccountNav, useHead, useModuleT, useUserSession } from '#imports'

// The account area as a settings page inside the public site: the host's `default` layout (site header and footer)
// around `AreaNavLayout` (`@frigear-nu/ui`), a centred settings grid. On wide screens a sticky left column shows the
// signed-in user and the account navigation (the `account` menu, or the enabled pages without the menu module); on
// narrow screens the same entries are a `PageSectionSwitcher` above the content. Pages render their own heading
// (`AccountHeader` or `PageHeading`). Without a `default` layout (e.g. an app with no layouts) `NuxtLayout` renders the
// content as is.
defineOptions({ name: 'AccountLayout' })

// The host's site layout. Cast: whether a `default` layout exists depends on the app, not on this module.
const siteLayout = 'default' as unknown as LayoutKey

const t = useModuleT('account')
const { user } = useUserSession()
const { links, current } = await useAccountNav()

const profile = computed(() => {
  const value = user.value as { name?: string | null, email?: string | null, avatar?: string | null } | null
  const name = value?.name || value?.email || t('title', 'Account')
  return {
    name,
    email: value?.name ? value.email ?? undefined : undefined,
    avatar: { src: value?.avatar || undefined, alt: name },
  }
})

// A default only: the heading's (or a page's own) `useHead` title wins.
useHead({ title: () => current.value?.label ?? t('title', 'Account') }, { tagPriority: 'low' })
</script>

<template>
  <NuxtLayout :name="siteLayout">
    <AreaNavLayout
      :links="links"
      :user="user ? profile : undefined"
      :label="t('nav.label', 'Account navigation')"
    >
      <slot />
    </AreaNavLayout>
  </NuxtLayout>
</template>
