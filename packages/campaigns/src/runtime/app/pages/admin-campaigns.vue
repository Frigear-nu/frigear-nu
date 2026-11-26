<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import type { CampaignDto, CampaignListDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { CAMPAIGN_STATUS_COLORS, CAMPAIGN_STATUSES, campaignTotals } from '../utils/admin-campaign'
import { computed, emptyCell, errorMessage, h, navigateTo, numericColumn, resolveComponent, tableUi, useCampaignActions, useCampaignsAccess, useCampaignsLinks, useCampaignsTranslate, useFetch, useFormat, useLazyFetch, useModuleT, useTableQuery } from '#imports'

defineOptions({ name: 'CampaignsAdminCampaignsPage' })

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const format = useFormat()
const links = useCampaignsLinks()
const can = await useCampaignsAccess()
const actions = useCampaignActions()

// Paginated on the server; page, search (name), status, kind and sort live in the URL. `all` stands for no filter.
const { page, pageSize, search, query, filters, filtered, reset } = useTableQuery({
  sort: { id: 'createdAt', desc: true },
  filters: { status: 'all', kind: 'all' },
})
const { data, status, error, refresh } = await useFetch<Page<CampaignDto>>(campaignsApi.admin.campaigns, { query })

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
// The toolbar once the list is longer than a screenful, and while a filter is on (so it can be cleared).
const showToolbar = computed(() => filtered.value || (data.value?.total ?? 0) > 8)

// List names for the audience column: secondary, so it does not hold up the page.
const { data: lists } = useLazyFetch<CampaignListDto[]>(campaignsApi.admin.lists, { key: 'campaigns:lists:names', default: () => [] })
const listNames = computed(() => new Map((lists.value ?? []).map(list => [list.id, tr(list.name)])))

const statusLabel = (value: string) => t(`campaign.statuses.${value}`, { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', cancelled: 'Cancelled' }[value] ?? value)
const kindLabel = (value: string) => t(`campaign.kinds.${value}`, value === 'message' ? 'Message' : 'Newsletter')
const channelLabel = (channel: string) => t(`campaign.channels.${channel}`, { email: 'Email', sms: 'SMS', push: 'Push' }[channel] ?? channel)
const statusOptions = computed(() => [
  { value: 'all', label: t('campaign.allStatuses', 'All statuses') },
  ...CAMPAIGN_STATUSES.map(value => ({ value, label: statusLabel(value) })),
])
const kindOptions = computed(() => [
  { value: 'all', label: t('campaign.allKinds', 'All kinds') },
  { value: 'newsletter', label: kindLabel('newsletter') },
  { value: 'message', label: kindLabel('message') },
])

function audienceSummary(campaign: CampaignDto): string {
  const { audience } = campaign
  if (campaign.kind === 'newsletter') {
    const names = (audience.listIds ?? []).map(id => listNames.value.get(id) ?? '').filter(Boolean)
    if (names.length) return names.join(', ')
    const count = audience.listIds?.length ?? 0
    return count ? t('campaign.listsCount', '{count} newsletters', { count }) : ''
  }
  const people = audience.userIds?.length ?? 0
  const groups = audience.grants?.length ?? 0
  return [
    people ? t('campaign.peopleCount', '{count} people', { count: people }) : '',
    groups ? t('campaign.groupsCount', '{count} groups', { count: groups }) : '',
  ].filter(Boolean).join(', ')
}

/** The time that matters for the status: when it goes, went or was stopped. */
const whenOf = (campaign: CampaignDto) => ({
  draft: campaign.updatedAt,
  scheduled: campaign.scheduledAt,
  sending: campaign.startedAt,
  sent: campaign.finishedAt,
  cancelled: campaign.cancelledAt,
}[campaign.status])

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')
const UBadge = resolveComponent('UBadge')

const count = (campaign: CampaignDto, key: 'sent' | 'opened' | 'clicked') => {
  const totals = campaignTotals(campaign.counts)
  if (!totals || (key === 'opened' && !campaign.trackOpens) || (key === 'clicked' && !campaign.trackClicks)) return emptyCell()
  return String(totals[key])
}

const columns = computed<TableColumn<CampaignDto>[]>(() => [
  {
    id: 'name',
    header: t('campaign.fields.name', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: row.original.name, description: kindLabel(row.original.kind) }, row.original.important
      ? { badges: () => h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm', label: t('campaign.important', 'Important') }) }
      : undefined),
  },
  {
    id: 'status',
    header: t('campaign.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: statusLabel(row.original.status), colors: CAMPAIGN_STATUS_COLORS }),
  },
  {
    id: 'channels',
    header: t('campaign.fields.channels', 'Channels'),
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, row.original.channels.map(channel => h(UBadge, { color: 'neutral', variant: 'subtle', label: channelLabel(channel) }))),
  },
  {
    id: 'audience',
    header: t('campaign.audience', 'Audience'),
    cell: ({ row }) => {
      const summary = audienceSummary(row.original)
      return summary ? h('span', { class: 'line-clamp-2' }, summary) : emptyCell()
    },
  },
  {
    id: 'when',
    header: t('campaign.when', 'When'),
    cell: ({ row }) => {
      const at = whenOf(row.original)
      return at ? h('span', { class: 'tabular-nums' }, format.dateTime(at)) : emptyCell()
    },
  },
  { id: 'sent', header: t('campaign.stats.sent', 'Sent'), meta: numericColumn, cell: ({ row }) => count(row.original, 'sent') },
  { id: 'opened', header: t('campaign.stats.opened', 'Opened'), meta: numericColumn, cell: ({ row }) => count(row.original, 'opened') },
  { id: 'clicked', header: t('campaign.stats.clicked', 'Clicked'), meta: numericColumn, cell: ({ row }) => count(row.original, 'clicked') },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onChanged: () => refresh(), onRemoved: () => refresh() }), subject: row.original.name }),
  },
])

function open(campaign: CampaignDto) {
  const to = links.adminCampaign(campaign.id)
  if (to) void navigateTo(to)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <CampaignsAdminHeading>
      <template
        v-if="can.manage"
        #actions
      >
        <UButton
          icon="i-lucide-plus"
          :label="t('campaign.create', 'Create campaign')"
          @click="actions.create()"
        />
      </template>
    </CampaignsAdminHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('campaign.forbidden', 'You are not allowed to see campaigns') : t('campaign.loadFailed', 'Campaigns could not be loaded')"
      :description="forbidden ? undefined : errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar v-if="showToolbar">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('campaign.search', 'Search campaigns')"
          :aria-label="t('campaign.search', 'Search campaigns')"
          class="w-full sm:max-w-xs"
        />
        <USelect
          v-model="filters.status"
          :items="statusOptions"
          :aria-label="t('campaign.status', 'Status')"
          class="w-40"
        />
        <USelect
          v-model="filters.kind"
          :items="kindOptions"
          :aria-label="t('campaign.fields.kind', 'Kind')"
          class="w-40"
        />
        <UButton
          v-if="filtered"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          :label="t('admin.clearFilters', 'Clear filters')"
          @click="reset"
        />
      </PageToolbar>

      <TableCard
        :loading="loading"
        :refreshing="refreshing"
      >
        <UTable
          :data="rows"
          :columns="columns"
          :ui="tableUi()"
          data-campaigns-table
          @select="(_: Event, row: { original: CampaignDto }) => open(row.original)"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('campaign.noMatches', 'No campaigns match')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-send"
              :title="t('campaign.empty', 'No campaigns yet')"
              :description="t('campaign.emptyDescription', 'Write a newsletter to your subscribers or a message to your users.')"
              :actions="can.manage ? [{ label: t('campaign.create', 'Create campaign'), icon: 'i-lucide-plus', onClick: () => actions.create() }] : []"
            />
          </template>
        </UTable>
        <template #footer>
          <TablePagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :total="data?.total ?? 0"
          />
        </template>
      </TableCard>
    </template>
  </div>
</template>
