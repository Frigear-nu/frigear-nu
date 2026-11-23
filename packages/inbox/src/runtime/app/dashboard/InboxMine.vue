<script setup lang="ts">
import { inboxApi } from '../../utils/api'
import type { InboxSummaryDto } from '../../../types'
import { computed, useInboxLinks, useLazyFetch, useModuleT } from '#imports'

defineOptions({ name: 'InboxDashboardMine' })

// "Assigned to me" (`inbox.mine`): open or pending threads assigned to the person. Shares the summary request with
// `inbox.unassigned`, and renders nothing for people who read no mailbox.
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
    :label="t('mine', 'Assigned to me')"
    icon="i-lucide-user-check"
    :value="data?.mine ?? 0"
    :hint="t('mineHint', 'Open threads waiting for your answer')"
    :to="links.admin({ assignee: 'me' })"
  />
</template>
