<script setup lang="ts">
import type { PageTabItem } from '@frigear-nu/ui/types'
import { computed, useLocaleLink, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'OAuthAdminHeading' })

/**
 * The heading of the OAuth admin area: one title for applications and scopes, the page's primary action (`#actions`),
 * then tabs linking the two pages. The Scopes tab is left out when `settings.pages.scopes` is `false`.
 */
defineSlots<{
  actions?: () => unknown
}>()

const t = useModuleT('oauthServer')
const { localize } = useLocaleLink()
const pages = (useRuntimeConfig().public.oauthServer as { pages?: { admin?: string | false, scopes?: string | false } } | undefined)?.pages

// Exact matching: each tab is its own page, and the scopes page sits under the applications path.
const tabs = computed<PageTabItem[]>(() => [
  ...(pages?.admin ? [{ label: t('heading.applications', 'Applications'), icon: 'i-lucide-app-window', to: localize(pages.admin), exact: true }] : []),
  ...(pages?.scopes ? [{ label: t('heading.scopes', 'Scopes'), icon: 'i-lucide-list-checks', to: localize(pages.scopes), exact: true }] : []),
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('heading.title', 'OAuth')"
      :description="t('heading.description', 'Applications that sign in with this site, and the scopes they can request.')"
    >
      <template
        v-if="$slots.actions"
        #actions
      >
        <slot name="actions" />
      </template>
    </PageHeading>
    <PageTabs
      v-if="tabs.length > 1"
      :items="tabs"
    />
  </div>
</template>
