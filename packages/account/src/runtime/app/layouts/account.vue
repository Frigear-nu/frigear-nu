<script setup lang="ts">
import type { LayoutKey } from '#app'

// The account area: the site's own `default` layout (header and footer) with a left account navigation built from
// the `account` menu. On narrow screens the navigation is a section switcher (a button with a menu) above the content. Without a `default` layout
// (e.g. an app with no layouts) `NuxtLayout` renders the content as is.
defineOptions({ name: 'AccountLayout' })

// The host's site layout. Cast: whether a `default` layout exists depends on the app, not on this module.
const siteLayout = 'default' as unknown as LayoutKey

const t = useModuleT('account')
const { user } = useUserSession()
const { links } = await useAccountNav()

const profile = computed(() => {
  const value = user.value as { name?: string | null, email?: string | null, avatar?: string | null } | null
  const name = value?.name || value?.email || t('title', 'Account')
  return {
    name,
    email: value?.name ? value.email ?? undefined : undefined,
    avatar: { src: value?.avatar || undefined, alt: name },
  }
})
</script>

<template>
  <NuxtLayout :name="siteLayout">
    <UContainer>
      <UPage>
        <template #left>
          <UPageAside>
            <UUser
              v-if="user"
              :name="profile.name"
              :description="profile.email"
              :avatar="profile.avatar"
              class="mb-4 px-2.5"
              :ui="{ name: 'truncate', description: 'truncate' }"
            />
            <UNavigationMenu
              :items="links"
              orientation="vertical"
              highlight
              :aria-label="t('nav.label', 'Account navigation')"
            />
          </UPageAside>
        </template>

        <div class="flex min-w-0 flex-col gap-6 py-8">
          <PageSectionSwitcher
            v-if="links.length"
            class="lg:hidden"
            :items="links"
            :label="t('nav.label', 'Account navigation')"
          />
          <AccountHeader />
          <slot />
        </div>
      </UPage>
    </UContainer>
  </NuxtLayout>
</template>
