<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import { renderMarkdown } from '@frigear-nu/ui/markdown'
import type { DescriptionItem } from '@frigear-nu/ui/types'
import type {
  CampaignChannelCounts,
  CampaignDeliveryDto,
  CampaignDto,
  CampaignLinkStatsDto,
  CampaignListDto,
  CampaignPreviewDto,
  CampaignSendChannel,
  CampaignStatsDto,
  CampaignUserLookupDto,
} from '../../../types'
import { campaignsApi } from '../../utils/api'
import { campaignSendIssues } from '../../utils/delivery'
import { translate } from '../../utils'
import { CAMPAIGN_STATUS_COLORS, campaignContentLocales, campaignTotals } from '../utils/admin-campaign'
import { computed, emptyCell, errorMessage, h, navigateTo, numericColumn, ref, resolveComponent, tableUi, useCampaignActions, useCampaignsAccess, useCampaignsLinks, useCampaignsLocale, useCampaignsTranslate, useFetch, useFormat, useLazyFetch, useModuleT, useRoute, watch } from '#imports'

defineOptions({ name: 'CampaignsAdminCampaignPage' })

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const viewerLocale = useCampaignsLocale()
const route = useRoute()
const links = useCampaignsLinks()
const format = useFormat()
const can = await useCampaignsAccess()
const actions = useCampaignActions()
const id = computed(() => String(route.params.id))

const { data: campaign, error, refresh } = await useFetch<CampaignDto>(() => campaignsApi.admin.campaign(id.value), { key: `campaigns:campaign:${id.value}` })
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const may = computed(() => campaign.value ? actions.allowed(campaign.value) : null)

// What keeps a draft from being sent, in the viewer's language (the API checks the same on send).
const issues = computed(() => campaign.value?.status === 'draft'
  ? campaignSendIssues(campaign.value).map(issue => t(`campaign.issues.${campaign.value!.kind}.${issue.path.join('_')}`, issue.message))
  : [])
const ready = computed(() => !issues.value.length)

// --- Labels ---------------------------------------------------------------------------------------------------------
const statusLabel = (value: string) => t(`campaign.statuses.${value}`, { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', cancelled: 'Cancelled' }[value] ?? value)
const kindLabel = (value: string) => t(`campaign.kinds.${value}`, value === 'message' ? 'To people' : 'To lists')
const channelLabel = (channel: string) => t(`campaign.channels.${channel}`, { email: 'Email', sms: 'SMS', push: 'Push' }[channel] ?? channel)
const deliveryStatusLabel = (value: string) => t(`campaign.deliveryStatuses.${value}`, { queued: 'Waiting', sending: 'Sending', sent: 'Sent', skipped: 'Skipped', failed: 'Failed' }[value] ?? value)
const skipReasonLabel = (value: string) => t(`campaign.skipReasons.${value}`, {
  disabled: 'Turned this channel off',
  unavailable: 'No address, phone number or device',
  unsubscribed: 'Unsubscribed before it went out',
  cancelled: 'Campaign cancelled',
}[value] ?? value)
const onOff = (value: boolean) => value ? t('campaign.on', 'On') : t('campaign.off', 'Off')

// --- Actions ----------------------------------------------------------------------------------------------------------
async function changed(next: CampaignDto | false) {
  if (!next) return
  campaign.value = next
  if (showPreview.value) await refreshPreview()
  if (hasStats.value) await refreshStats()
}
const menu = computed(() => campaign.value
  ? actions.menu(campaign.value, { open: false, onChanged: changed, onRemoved: () => navigateTo(links.adminCampaigns() ?? '/') })
  : [])

// --- Summary --------------------------------------------------------------------------------------------------------
const summary = computed<DescriptionItem[]>(() => {
  const value = campaign.value
  if (!value) return []
  const dateOf = (at: string | null) => at ? format.dateTime(at) : null
  return [
    { key: 'kind', label: t('campaign.fields.kind', 'Kind'), value: kindLabel(value.kind) },
    { key: 'channels', label: t('campaign.fields.channels', 'Channels'), value: value.channels.map(channelLabel).join(', ') },
    ...(value.scheduledAt ? [{ key: 'scheduledAt', label: t('campaign.scheduledAt', 'Goes out'), value: dateOf(value.scheduledAt) }] : []),
    ...(value.startedAt ? [{ key: 'startedAt', label: t('campaign.startedAt', 'Started'), value: dateOf(value.startedAt) }] : []),
    ...(value.finishedAt ? [{ key: 'finishedAt', label: t('campaign.finishedAt', 'Finished'), value: dateOf(value.finishedAt) }] : []),
    ...(value.cancelledAt ? [{ key: 'cancelledAt', label: t('campaign.cancelledAt', 'Cancelled'), value: dateOf(value.cancelledAt) }] : []),
    { key: 'trackClicks', label: t('campaign.fields.trackClicks', 'Count clicks'), value: onOff(value.trackClicks) },
    ...(value.channels.includes('email') ? [{ key: 'trackOpens', label: t('campaign.fields.trackOpens', 'Count opens'), value: onOff(value.trackOpens) }] : []),
    ...(value.kind === 'message' ? [{ key: 'important', label: t('campaign.fields.important', 'Important message'), value: value.important ? t('campaign.importantYes', 'Yes: it reaches people also on channels they turned off') : t('campaign.importantNo', 'No') }] : []),
    { key: 'createdAt', label: t('campaign.createdAt', 'Created'), value: dateOf(value.createdAt) },
  ]
})

// --- Audience -------------------------------------------------------------------------------------------------------
const { data: lists } = useLazyFetch<CampaignListDto[]>(campaignsApi.admin.lists, { key: 'campaigns:lists:names', default: () => [] })
const audienceLists = computed(() => (campaign.value?.audience.listIds ?? []).map((listId) => {
  const list = (lists.value ?? []).find(entry => entry.id === listId)
  return { id: listId, name: list ? tr(list.name) : listId, to: links.adminList(listId) }
}))
const userIds = computed(() => campaign.value?.kind === 'message' ? (campaign.value.audience.userIds ?? []) : [])
const { data: people, status: peopleStatus } = useLazyFetch<CampaignUserLookupDto[]>(campaignsApi.admin.users, {
  key: `campaigns:campaign:${id.value}:people`,
  query: computed(() => ({ ids: userIds.value.join(',') })),
  immediate: userIds.value.length > 0,
  default: () => [],
})
const peopleNames = computed(() => userIds.value.map((userId) => {
  const person = (people.value ?? []).find(entry => String(entry.id) === String(userId))
  return person?.name || person?.email || `#${userId}`
}))
const grants = computed(() => campaign.value?.audience.grants ?? [])

// How many it reaches now, while it can still go out.
const showPreview = computed(() => campaign.value?.status === 'draft' || campaign.value?.status === 'scheduled')
const { data: preview, status: previewStatus, error: previewError, refresh: refreshPreview } = useLazyFetch<CampaignPreviewDto>(() => campaignsApi.admin.preview(id.value), {
  key: `campaigns:campaign:${id.value}:preview`,
  immediate: showPreview.value,
  watch: false,
})
const previewItems = computed<DescriptionItem[]>(() => [
  { key: 'recipients', label: t('campaign.previewRecipients', 'People'), value: preview.value?.recipients ?? 0 },
  ...(campaign.value?.channels ?? []).map(channel => ({ key: channel, label: channelLabel(channel), value: preview.value?.channels[channel] ?? 0 })),
])

// --- Content --------------------------------------------------------------------------------------------------------
const contentLocales = computed(() => campaign.value ? campaignContentLocales(campaign.value.content) : [])
const contentLocale = ref<string>('')
watch(contentLocales, (locales) => {
  if (locales.includes(contentLocale.value)) return
  contentLocale.value = locales.find(locale => locale === viewerLocale.value)
    ?? locales.find(locale => locale === campaign.value?.locale)
    ?? locales[0]
    ?? viewerLocale.value
}, { immediate: true })
const localeItems = computed(() => contentLocales.value.map(locale => ({ value: locale, label: locale.toUpperCase() })))
const text = (value: Parameters<typeof translate>[0]) => translate(value, contentLocale.value, campaign.value?.locale ?? undefined)
const emailHtml = computed(() => renderMarkdown(text(campaign.value?.content.email?.body)))

// --- Results --------------------------------------------------------------------------------------------------------
const hasStats = computed(() => !!campaign.value && ['sending', 'sent', 'cancelled'].includes(campaign.value.status))
const { data: stats, status: statsStatus, error: statsError, refresh: refreshStats } = useLazyFetch<CampaignStatsDto>(() => campaignsApi.admin.stats(id.value), {
  key: `campaigns:campaign:${id.value}:stats`,
  immediate: hasStats.value,
  watch: false,
})
const statsLoading = computed(() => statsStatus.value === 'pending' && !stats.value)
const totals = computed(() => campaignTotals(stats.value?.counts ?? campaign.value?.counts))
const statCards = computed(() => {
  const value = totals.value
  const tracked = campaign.value
  if (!value || !tracked) return []
  return [
    { key: 'sent', label: t('campaign.stats.sent', 'Sent'), value: value.sent, icon: 'i-lucide-send' },
    ...(value.queued ? [{ key: 'queued', label: t('campaign.stats.queued', 'Waiting'), value: value.queued, icon: 'i-lucide-hourglass' }] : []),
    { key: 'skipped', label: t('campaign.stats.skipped', 'Skipped'), value: value.skipped, icon: 'i-lucide-circle-slash' },
    { key: 'failed', label: t('campaign.stats.failed', 'Failed'), value: value.failed, icon: 'i-lucide-circle-x' },
    ...(tracked.trackOpens ? [{ key: 'opened', label: t('campaign.stats.opened', 'Opened'), value: value.opened, icon: 'i-lucide-mail-open' }] : []),
    ...(tracked.trackClicks ? [{ key: 'clicked', label: t('campaign.stats.clicked', 'Clicked'), value: value.clicked, icon: 'i-lucide-mouse-pointer-click' }] : []),
  ]
})
type ChannelRow = CampaignChannelCounts & { channel: CampaignSendChannel }
const channelRows = computed<ChannelRow[]>(() => Object.entries(stats.value?.counts ?? campaign.value?.counts ?? {})
  .filter((entry): entry is [CampaignSendChannel, CampaignChannelCounts] => !!entry[1])
  .map(([channel, counts]) => ({ channel, ...counts })))
const skipItems = computed<DescriptionItem[]>(() => Object.entries(stats.value?.skipReasons ?? {})
  .filter(([, count]) => !!count)
  .map(([reason, count]) => ({ key: reason, label: skipReasonLabel(reason), value: count ?? 0 })))

const channelColumns = computed<TableColumn<ChannelRow>[]>(() => [
  { id: 'channel', header: t('campaign.channel', 'Channel'), cell: ({ row }) => channelLabel(row.original.channel) },
  { id: 'total', header: t('campaign.stats.total', 'Recipients'), meta: numericColumn, cell: ({ row }) => String(row.original.total) },
  { id: 'sent', header: t('campaign.stats.sent', 'Sent'), meta: numericColumn, cell: ({ row }) => String(row.original.sent) },
  { id: 'skipped', header: t('campaign.stats.skipped', 'Skipped'), meta: numericColumn, cell: ({ row }) => String(row.original.skipped) },
  { id: 'failed', header: t('campaign.stats.failed', 'Failed'), meta: numericColumn, cell: ({ row }) => String(row.original.failed) },
  ...(campaign.value?.trackOpens ? [{ id: 'opened', header: t('campaign.stats.opened', 'Opened'), meta: numericColumn, cell: ({ row }: { row: { original: ChannelRow } }) => row.original.channel === 'email' ? String(row.original.opened) : emptyCell() }] : []),
  ...(campaign.value?.trackClicks ? [{ id: 'clicked', header: t('campaign.stats.clicked', 'Clicked'), meta: numericColumn, cell: ({ row }: { row: { original: ChannelRow } }) => String(row.original.clicked) }] : []),
])

const linkColumns = computed<TableColumn<CampaignLinkStatsDto>[]>(() => [
  {
    id: 'url',
    header: t('campaign.linkUrl', 'Link'),
    cell: ({ row }) => h('a', { href: row.original.url, target: '_blank', rel: 'noopener', class: 'block max-w-md truncate text-primary hover:underline' }, row.original.url),
  },
  { id: 'clicks', header: t('campaign.linkClicks', 'Clicks'), meta: numericColumn, cell: ({ row }) => String(row.original.clicks) },
  { id: 'recipients', header: t('campaign.linkRecipients', 'People who clicked'), meta: numericColumn, cell: ({ row }) => String(row.original.recipients) },
])

// --- Deliveries (`campaigns:pii`) -------------------------------------------------------------------------------------
const showDeliveries = computed(() => can.value.pii && hasStats.value)
const deliveriesPage = ref(1)
const deliveriesPageSize = ref(20)
const deliveryStatus = ref<'all' | 'queued' | 'sent' | 'skipped' | 'failed'>('all')
const deliveryChannel = ref<'all' | CampaignSendChannel>('all')
watch([deliveryStatus, deliveryChannel], () => {
  deliveriesPage.value = 1
})
const deliveriesQuery = computed(() => ({ page: deliveriesPage.value, pageSize: deliveriesPageSize.value, status: deliveryStatus.value, channel: deliveryChannel.value, sort: 'sentAt', order: 'desc' }))
const { data: deliveries, status: deliveriesStatus, error: deliveriesError, refresh: refreshDeliveries } = useLazyFetch<Page<CampaignDeliveryDto>>(() => campaignsApi.admin.deliveries(id.value), {
  key: `campaigns:campaign:${id.value}:deliveries`,
  query: deliveriesQuery,
  immediate: showDeliveries.value,
  watch: false,
})
watch(deliveriesQuery, () => {
  if (showDeliveries.value) void refreshDeliveries()
})
watch(hasStats, (value) => {
  if (!value) return
  void refreshStats()
  if (showDeliveries.value) void refreshDeliveries()
})
const deliveriesLoading = computed(() => deliveriesStatus.value === 'pending' && !deliveries.value)
const deliveriesRefreshing = computed(() => deliveriesStatus.value === 'pending' && !!deliveries.value)
const deliveriesFiltered = computed(() => deliveryStatus.value !== 'all' || deliveryChannel.value !== 'all')
const deliveryStatusOptions = computed(() => [
  { value: 'all', label: t('campaign.allStatuses', 'All statuses') },
  ...(['sent', 'queued', 'skipped', 'failed'] as const).map(value => ({ value, label: deliveryStatusLabel(value) })),
])
const deliveryChannelOptions = computed(() => [
  { value: 'all', label: t('campaign.allChannels', 'All channels') },
  ...(campaign.value?.channels ?? []).map(value => ({ value, label: channelLabel(value) })),
])

async function refreshResults() {
  await Promise.all([refresh(), refreshStats(), showDeliveries.value ? refreshDeliveries() : undefined])
}

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')

const deliveryColumns = computed<TableColumn<CampaignDeliveryDto>[]>(() => [
  {
    id: 'recipient',
    header: t('campaign.recipient', 'Recipient'),
    cell: ({ row }) => {
      const { recipient } = row.original
      const title = recipient.name || recipient.address || (recipient.userId ? `#${recipient.userId}` : t('admin.noName', 'No name'))
      return h(TableIdentity, { title, description: recipient.name ? recipient.address ?? undefined : undefined })
    },
  },
  { id: 'channel', header: t('campaign.channel', 'Channel'), cell: ({ row }) => channelLabel(row.original.channel) },
  {
    id: 'status',
    header: t('campaign.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: deliveryStatusLabel(row.original.status), colors: { queued: 'neutral', sending: 'info', skipped: 'neutral' } }),
  },
  {
    id: 'note',
    header: t('campaign.note', 'Why'),
    cell: ({ row }) => row.original.skipReason
      ? skipReasonLabel(row.original.skipReason)
      : row.original.error ? h('span', { class: 'line-clamp-2 text-error' }, row.original.error) : emptyCell(),
  },
  {
    id: 'sentAt',
    header: t('campaign.sentAt', 'Sent'),
    cell: ({ row }) => row.original.sentAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.sentAt)) : emptyCell(),
  },
  ...(campaign.value?.trackOpens
    ? [{
        id: 'openedAt',
        header: t('campaign.openedAt', 'Opened'),
        cell: ({ row }: { row: { original: CampaignDeliveryDto } }) => row.original.openedAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.openedAt)) : emptyCell(),
      }]
    : []),
  ...(campaign.value?.trackClicks
    ? [{ id: 'clicks', header: t('campaign.linkClicks', 'Clicks'), meta: numericColumn, cell: ({ row }: { row: { original: CampaignDeliveryDto } }) => String(row.original.clicks) }]
    : []),
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="campaign">
      <PageHeading
        :title="campaign.name"
        :breadcrumb="[{ label: t('heading.campaigns', 'Campaigns'), to: links.adminCampaigns() }, { label: campaign.name }]"
      >
        <template #badge>
          <StatusBadge
            :status="campaign.status"
            :label="statusLabel(campaign.status)"
            :colors="CAMPAIGN_STATUS_COLORS"
          />
          <UBadge
            color="neutral"
            variant="subtle"
            :label="kindLabel(campaign.kind)"
          />
          <UBadge
            v-if="campaign.important"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :label="t('campaign.important', 'Important')"
          />
        </template>
        <template #actions>
          <UButton
            v-if="may?.edit"
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            :label="t('campaign.edit', 'Edit campaign')"
            @click="actions.edit(campaign).then(changed)"
          />
          <UButton
            v-if="may?.schedule"
            color="neutral"
            variant="outline"
            icon="i-lucide-calendar-clock"
            :disabled="!ready"
            :label="t('campaign.scheduleAction', 'Schedule campaign')"
            data-campaign-schedule
            @click="actions.schedule(campaign).then(changed)"
          />
          <UButton
            v-if="may?.send"
            icon="i-lucide-send"
            :disabled="!ready"
            :label="t('campaign.sendAction', 'Send campaign')"
            data-campaign-send
            @click="actions.send(campaign).then(changed)"
          />
          <UButton
            v-if="may?.cancel"
            color="error"
            variant="outline"
            icon="i-lucide-circle-stop"
            :label="t('campaign.cancelCampaignAction', 'Cancel campaign')"
            data-campaign-cancel
            @click="actions.cancel(campaign).then(changed)"
          />
          <RowMenu
            v-if="menu.length"
            variant="outline"
            :subject="campaign.name"
            :items="menu"
          />
        </template>
      </PageHeading>

      <UAlert
        v-if="campaign.status === 'draft' && !ready"
        color="warning"
        variant="subtle"
        icon="i-lucide-list-checks"
        :title="t('campaign.notReady', 'Finish the draft before sending it')"
        data-campaign-issues
      >
        <template #description>
          <ul class="list-disc ps-4">
            <li
              v-for="issue in issues"
              :key="issue"
            >
              {{ issue }}
            </li>
          </ul>
        </template>
      </UAlert>
      <UAlert
        v-else-if="campaign.status === 'draft' && !may?.send && can.manage"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="campaign.important && can.send ? t('campaign.needsSendImportant', 'Sending an important message needs the permission to send important messages.') : t('campaign.needsSend', 'Someone who may send campaigns sends or schedules it.')"
      />

      <template v-if="hasStats">
        <div
          v-if="statsLoading || statCards.length"
          class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          data-campaign-stats
        >
          <template v-if="statsLoading">
            <StatCard
              v-for="index in 4"
              :key="index"
              :label="t('campaign.stats.sent', 'Sent')"
              loading
            />
          </template>
          <StatCard
            v-for="card in statCards"
            v-else
            :key="card.key"
            :label="card.label"
            :value="card.value"
            :icon="card.icon"
          />
        </div>
        <UAlert
          v-if="statsError && !stats"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('campaign.statsFailed', 'The results could not be loaded')"
          :description="errorMessage(statsError, '')"
        />
      </template>

      <SectionCard :title="t('campaign.summary', 'Summary')">
        <DescriptionList :items="summary" />
      </SectionCard>

      <SectionCard
        :title="t('campaign.audience', 'Audience')"
        :description="campaign.kind === 'newsletter'
          ? t('campaign.audienceLists', 'The active subscribers of these lists, each once per channel.')
          : t('campaign.audienceMessage', 'These people and everyone in these groups, each once.')"
      >
        <div class="flex flex-col gap-4">
          <div
            v-if="campaign.kind === 'newsletter'"
            class="flex flex-wrap gap-2"
          >
            <template v-if="audienceLists.length">
              <UButton
                v-for="list in audienceLists"
                :key="list.id"
                :to="list.to"
                color="neutral"
                variant="subtle"
                size="sm"
                icon="i-lucide-list"
                :label="list.name"
              />
            </template>
            <span
              v-else
              class="text-dimmed text-sm"
            >{{ t('campaign.noLists', 'No lists picked yet.') }}</span>
          </div>
          <template v-else>
            <div class="flex flex-col gap-1">
              <span class="text-muted text-sm">{{ t('campaign.fields.people', 'People') }}</span>
              <USkeleton
                v-if="userIds.length && peopleStatus === 'pending' && !people?.length"
                class="h-4 w-48"
              />
              <p
                v-else-if="peopleNames.length"
                class="text-highlighted text-sm"
              >
                {{ peopleNames.join(', ') }}
              </p>
              <span
                v-else
                class="text-dimmed text-sm"
              >{{ t('campaign.noPeople', 'Nobody picked by name.') }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-muted text-sm">{{ t('campaign.fields.groups', 'Groups') }}</span>
              <GrantsEditor
                v-if="grants.length"
                :model-value="grants"
                disabled
              />
              <span
                v-else
                class="text-dimmed text-sm"
              >{{ t('campaign.noGroups', 'No groups.') }}</span>
            </div>
          </template>

          <div
            v-if="showPreview"
            class="flex flex-col gap-2 border-t border-default pt-4"
            data-campaign-preview
          >
            <span class="text-highlighted text-sm font-medium">{{ campaign.kind === 'message' && campaign.status === 'scheduled' ? t('campaign.previewTitleFixed', 'Who it goes to, fixed when it was scheduled') : t('campaign.previewTitle', 'Who it reaches now') }}</span>
            <UAlert
              v-if="previewError"
              color="warning"
              variant="subtle"
              icon="i-lucide-users"
              :title="errorMessage(previewError, t('campaign.previewFailed', 'Could not count who it reaches'))"
            />
            <DescriptionList
              v-else
              :items="previewItems"
              :loading="previewStatus === 'pending' && !preview"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        :title="t('campaign.content', 'Content')"
        :description="t('campaign.contentDescription', 'What recipients get. Each gets their own language when it is written, else the campaign\'s.')"
      >
        <template
          v-if="localeItems.length > 1"
          #actions
        >
          <USelect
            v-model="contentLocale"
            :items="localeItems"
            :aria-label="t('campaign.language', 'Language')"
            class="w-24"
          />
        </template>
        <div class="flex flex-col gap-6">
          <div
            v-if="campaign.channels.includes('email')"
            class="flex flex-col gap-2"
            data-campaign-content-email
          >
            <span class="text-muted flex items-center gap-1.5 text-sm"><UIcon name="i-lucide-mail" />{{ channelLabel('email') }}</span>
            <div
              v-if="campaign.content.email"
              class="rounded-md border border-default"
            >
              <div class="border-b border-default px-4 py-2 text-sm">
                <span class="text-muted">{{ t('campaign.fields.subject', 'Subject') }}:</span>
                <span class="ms-1 text-highlighted font-medium">{{ text(campaign.content.email.subject) }}</span>
              </div>
              <!-- eslint-disable vue/no-v-html -- renderMarkdown escapes everything first -->
              <div
                class="flex flex-col gap-3 px-4 py-3 text-sm"
                v-html="emailHtml"
              />
              <!-- eslint-enable vue/no-v-html -->
              <p class="text-dimmed border-t border-default px-4 py-2 text-xs">
                {{ t('campaign.emailFooterNote', 'Each email ends with a link to unsubscribe and one to the recipient\'s settings.') }}
              </p>
            </div>
            <span
              v-else
              class="text-dimmed text-sm"
            >{{ t('campaign.noText', 'Not written yet.') }}</span>
          </div>

          <div
            v-if="campaign.channels.includes('sms')"
            class="flex flex-col gap-2"
          >
            <span class="text-muted flex items-center gap-1.5 text-sm"><UIcon name="i-lucide-message-square" />{{ channelLabel('sms') }}</span>
            <p
              v-if="campaign.content.sms"
              class="bg-elevated max-w-sm whitespace-pre-line rounded-lg px-3 py-2 text-sm"
            >
              {{ text(campaign.content.sms.body) }}
            </p>
            <span
              v-else
              class="text-dimmed text-sm"
            >{{ t('campaign.noText', 'Not written yet.') }}</span>
          </div>

          <div
            v-if="campaign.channels.includes('push')"
            class="flex flex-col gap-2"
          >
            <span class="text-muted flex items-center gap-1.5 text-sm"><UIcon name="i-lucide-bell" />{{ channelLabel('push') }}</span>
            <div
              v-if="campaign.content.push"
              class="flex max-w-sm flex-col gap-0.5 rounded-lg border border-default px-3 py-2 text-sm"
            >
              <span class="text-highlighted font-medium">{{ text(campaign.content.push.title) }}</span>
              <span>{{ text(campaign.content.push.body) }}</span>
              <span
                v-if="campaign.content.push.url"
                class="text-muted truncate text-xs"
              >{{ campaign.content.push.url }}</span>
            </div>
            <span
              v-else
              class="text-dimmed text-sm"
            >{{ t('campaign.noText', 'Not written yet.') }}</span>
          </div>
        </div>
      </SectionCard>

      <template v-if="hasStats">
        <TableCard
          :title="t('campaign.byChannel', 'Results by channel')"
          :loading="statsLoading"
        >
          <template #actions>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-refresh-cw"
              :loading="statsStatus === 'pending' && !!stats"
              :label="t('campaign.refreshResults', 'Refresh results')"
              @click="refreshResults"
            />
          </template>
          <UTable
            :data="channelRows"
            :columns="channelColumns"
            :ui="tableUi({ tr: '' })"
          >
            <template #empty>
              <UEmpty
                variant="naked"
                icon="i-lucide-hourglass"
                :title="t('campaign.noResults', 'Nothing has gone out yet')"
              />
            </template>
          </UTable>
        </TableCard>

        <SectionCard
          v-if="skipItems.length"
          :title="t('campaign.skippedTitle', 'Why some got nothing')"
        >
          <DescriptionList
            :items="skipItems"
            align="end"
          />
        </SectionCard>

        <TableCard
          v-if="campaign.trackClicks && (statsLoading || stats?.links.length)"
          :title="t('campaign.links', 'Links')"
          :description="t('campaign.linksDescription', 'Clicks on each link in the campaign.')"
          :loading="statsLoading"
          data-campaign-links
        >
          <UTable
            :data="stats?.links ?? []"
            :columns="linkColumns"
            :ui="tableUi({ tr: '' })"
          />
        </TableCard>

        <TableCard
          v-if="showDeliveries"
          :title="t('campaign.deliveries', 'Recipients')"
          :description="t('campaign.deliveriesDescription', 'Who it went to on each channel, and what happened.')"
          :loading="deliveriesLoading"
          :refreshing="deliveriesRefreshing"
          data-campaign-deliveries
        >
          <template #actions>
            <USelect
              v-model="deliveryStatus"
              :items="deliveryStatusOptions"
              :aria-label="t('campaign.status', 'Status')"
              class="w-40"
            />
            <USelect
              v-if="campaign.channels.length > 1"
              v-model="deliveryChannel"
              :items="deliveryChannelOptions"
              :aria-label="t('campaign.channel', 'Channel')"
              class="w-36"
            />
          </template>
          <UAlert
            v-if="deliveriesError && !deliveries"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('campaign.deliveriesFailed', 'The recipients could not be loaded')"
            :description="errorMessage(deliveriesError, '')"
            class="m-4"
          />
          <UTable
            v-else
            :data="deliveries?.items ?? []"
            :columns="deliveryColumns"
            :ui="tableUi({ tr: '' })"
          >
            <template #empty>
              <UEmpty
                v-if="deliveriesFiltered"
                variant="naked"
                icon="i-lucide-search"
                :title="t('campaign.noDeliveryMatches', 'No recipients match')"
                :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: () => { deliveryStatus = 'all'; deliveryChannel = 'all' } }]"
              />
              <UEmpty
                v-else
                variant="naked"
                icon="i-lucide-users"
                :title="t('campaign.noDeliveries', 'No recipients yet')"
                :description="t('campaign.noDeliveriesDescription', 'They show up here once it starts going out. After a while only the counts are kept.')"
              />
            </template>
          </UTable>
          <template #footer>
            <TablePagination
              v-model:page="deliveriesPage"
              v-model:page-size="deliveriesPageSize"
              :total="deliveries?.total ?? 0"
            />
          </template>
        </TableCard>
      </template>
    </template>

    <UEmpty
      v-else
      :icon="notFound ? 'i-lucide-search-x' : forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="notFound ? t('campaign.notFound', 'Campaign not found') : forbidden ? t('campaign.forbidden', 'You are not allowed to see campaigns') : t('campaign.loadFailed', 'Campaigns could not be loaded')"
      :description="notFound ? t('campaign.notFoundDescription', 'It may have been deleted.') : forbidden ? undefined : errorMessage(error, '')"
      :actions="notFound || forbidden
        ? [{ label: t('campaign.backToList', 'All campaigns'), icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'outline', to: links.adminCampaigns() }]
        : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
