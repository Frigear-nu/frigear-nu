<script setup lang="ts">
import type { PageTabItem } from '@frigear-nu/ui/types'
import { computed, useCampaignsLinks, useModuleT } from '#imports'

defineOptions({ name: 'CampaignsAdminHeading' })

/**
 * The heading of the campaigns admin area: one title for campaigns and lists, the page's primary action
 * (`#actions`), then tabs linking the two pages. A tab whose page is turned off (`settings.pages`) is left out.
 */
defineSlots<{
  actions?: () => unknown
}>()

const t = useModuleT('campaigns')
const links = useCampaignsLinks()

// Exact matching: each tab is its own page, and the lists page sits under the campaigns path.
const tabs = computed<PageTabItem[]>(() => {
  const campaigns = links.adminCampaigns()
  const lists = links.adminLists()
  return [
    ...(campaigns ? [{ label: t('heading.campaigns', 'Campaigns'), icon: 'i-lucide-send', to: campaigns, exact: true }] : []),
    ...(lists ? [{ label: t('heading.lists', 'Lists'), icon: 'i-lucide-newspaper', to: lists, exact: true }] : []),
  ]
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('heading.title', 'Campaigns')"
      :description="t('heading.description', 'Campaigns to the subscribers of lists and to people, and the lists people sign up to.')"
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
