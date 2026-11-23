<script setup lang="ts">
import { inboxApi } from '../../utils/api'
import type { InboxSummaryDto } from '../../../types'
import { computed, useInboxLinks, useLazyFetch, useModuleT } from '#imports'

defineOptions({ name: 'InboxDashboardUnassigned' })

// "Unassigned messages" (`inbox.unassigned`): open or pending threads nobody has, in the mailboxes the person reads.
// It renders nothing while loading and for people who read no mailbox, so volunteers never see an inbox card.
const t = useModuleT('inbox.dashboard')
const links = useInboxLinks()
const { data, status } = useLazyFetch<InboxSummaryDto>(inboxApi.admin.summary, {
  key: 'inbox:summary',
  server: false,
  onResponseError: () => {},
})
const visible = computed(() => status.value === 'success' && (data.value?.mailboxes ?? 0) > 0)
</script>

<template>
  <StatCard
    v-if="visible"
    :label="t('unassigned', 'Unassigned messages')"
    icon="i-lucide-inbox"
    :value="data?.unassigned ?? 0"
    :hint="t('unassignedHint', 'Open threads nobody has picked up')"
    :to="links.admin({ assignee: 'none' })"
  />
</template>
