<script setup lang="ts">
import type { LayoutKey } from '#app'

// The account area as a settings page inside the public site: the host's `default` layout (site header and footer)
// around a centred settings grid. On wide screens a sticky left column shows the signed-in user and the account
// navigation (the `account` menu, or the enabled pages without the menu module); on narrow screens the same entries
// are a `PageSectionSwitcher` above the content. Pages render their own heading (`AccountHeader` or `PageHeading`).
// Without a `default` layout (e.g. an app with no layouts) `NuxtLayout` renders the content as is.
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
    <UContainer>
      <div class="mx-auto w-full max-w-5xl py-8 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        <aside class="hidden lg:block">
          <div class="sticky top-[calc(var(--ui-header-height,4rem)+2.5rem)] flex flex-col gap-4">
            <UUser
              v-if="user"
              :name="profile.name"
              :description="profile.email"
              :avatar="profile.avatar"
              size="sm"
              class="px-2.5"
              :ui="{ name: 'truncate', description: 'truncate' }"
            />
            <UNavigationMenu
              :items="links"
              orientation="vertical"
              highlight
              :aria-label="t('nav.label', 'Account navigation')"
            />
          </div>
        </aside>

        <!-- `self-start`: a stretched grid item has a definite height, which `h-full` cards inside a page would fill. -->
        <div class="flex min-w-0 flex-col gap-4 lg:self-start">
          <PageSectionSwitcher
            v-if="links.length"
            class="mb-2 lg:hidden"
            :items="links"
            :label="t('nav.label', 'Account navigation')"
          />
          <slot />
        </div>
      </div>
    </UContainer>
  </NuxtLayout>
</template>
