<script setup lang="ts">
import type { MenuItem } from '@frigear-nu/menu'

const t = useModuleT('account')
const route = useRoute()
const { user } = useUserSession()
const pages = useRuntimeConfig().public.account?.pages
const nuxtApp = useNuxtApp() as { $i18n?: { locales?: { value?: unknown[] } } }

// `@frigear-nu/menu` is optional: without it there are no items to match and the header falls back to the plain title.
const items = typeof useMenu === 'function' ? useMenu('account').data : ref<MenuItem[]>([])

const trimSlash = (path: string) => path.length > 1 ? path.replace(/\/+$/, '') : path

// With a locale prefix strategy the route is `/<locale>/account/...` while the items point at the plain path.
const stripLocale = (path: string) => {
  const trimmed = trimSlash(path)
  const first = trimmed.split('/')[1]
  const codes = (nuxtApp.$i18n?.locales?.value ?? []).map(locale => typeof locale === 'string' ? locale : (locale as { code: string }).code)
  return first && codes.includes(first) ? (trimmed.slice(first.length + 1) || '/') : trimmed
}

// The menu item the current route belongs to, so the header follows whatever the account pages are configured and
// registered as (including pages other modules add to the account menu) instead of a fixed list.
const current = computed(() => {
  const path = stripLocale(route.path)
  return (items.value ?? []).find(item => item.to && !item.external && stripLocale(item.to) === path)
})

const title = computed(() => current.value?.label ?? t('title', 'Account'))
const description = computed(() => current.value?.description)
</script>

<template>
  <UContainer>
    <UPageHeader
      :title="title"
      :description="description"
      :ui="{ wrapper: 'flex-row items-center justify-between gap-4', description: 'mt-2' }"
    >
      <UButton
        v-if="current && pages?.index"
        variant="link"
        icon="i-lucide-arrow-left"
        :to="pages.index"
        :label="t('backTo', 'Back to account')"
        class="-ml-3 mt-2"
      />

      <template #links>
        <div
          v-if="user"
          class="flex flex-col"
        >
          <div class="text-sm text-muted">
            {{ t('signedInAs', 'Signed in as') }}
          </div>
          <div class="text-primary">
            {{ user.email }}
          </div>
          <div class="mt-1 flex justify-end">
            <UBadge variant="soft">
              Frigear ID: <code>{{ user.id }}</code>
            </UBadge>
          </div>
        </div>
      </template>
    </UPageHeader>
  </UContainer>
</template>
