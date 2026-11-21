<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import { channels } from '#inbox/registry'
import { inboxApi } from '../../utils/api'
import { INBOX_STATUS_LABELS } from '../../utils'
import type { InboxMailboxDto, InboxThreadListItemDto } from '../../../types'
import { computed, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useFormat, useInboxLinks, useInboxThreadActions, useInboxTranslate, useModuleT, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'InboxAdminPage' })

const t = useModuleT('inbox')
const tr = useInboxTranslate()
const format = useFormat()
const links = useInboxLinks()
const actions = useInboxThreadActions()

// Paginated on the server; page, search (subject), filters and sort live in the URL. `all` stands for no filter (a
// select cannot hold an empty value).
const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'lastMessageAt', desc: true },
  filters: { mailbox: 'all', status: 'active', assignee: 'all', channel: 'all' },
})
const { sorting, header } = useTableSort(null, sortState)
// Filters at their default stay out of the query: the API lists open and pending threads unless `status` says more.
const { data, status, error, refresh } = await useFetch<Page<InboxThreadListItemDto>>(inboxApi.admin.threads, { query })
const { data: mailboxes } = await useFetch<InboxMailboxDto[]>(inboxApi.admin.mailboxes, { key: 'inbox:mailboxes', default: () => [] })

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const mailboxName = (id: string) => tr(mailboxes.value?.find(mailbox => mailbox.id === id)?.name) || id

const mailboxOptions = computed(() => [
  { label: t('list.allMailboxes', 'All mailboxes'), value: 'all' },
  ...(mailboxes.value ?? []).map(mailbox => ({ label: tr(mailbox.name) || mailbox.key, value: mailbox.id })),
])
const statusOptions = computed(() => [
  { label: t('list.active', 'Open and pending'), value: 'active' },
  { label: t('status.open', 'Open'), value: 'open' },
  { label: t('status.pending', 'Pending'), value: 'pending' },
  { label: t('status.closed', 'Closed'), value: 'closed' },
  { label: t('list.allStatuses', 'Any status'), value: 'all' },
])
const assigneeOptions = computed(() => [
  { label: t('list.anyone', 'Anyone'), value: 'all' },
  { label: t('list.mine', 'Assigned to me'), value: 'me' },
  { label: t('list.nobody', 'Unassigned'), value: 'none' },
])
const channelOptions = computed(() => [
  { label: t('list.allChannels', 'All channels'), value: 'all' },
  ...Object.values(channels).map(channel => ({ label: tr(channel.label) || channel.id, value: channel.id })),
])
const statusColors = { open: 'info', pending: 'warning', closed: 'neutral' } as const

const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')
const StatusBadge = resolveComponent('StatusBadge')
const UIcon = resolveComponent('UIcon')

const columns = computed<TableColumn<InboxThreadListItemDto>[]>(() => [
  {
    id: 'subject',
    header: t('list.thread', 'Thread'),
    cell: ({ row }) => h('div', { class: 'max-w-md min-w-56 truncate' }, h(TableIdentity, {
      title: row.original.subject || t('thread.noSubject', '(no subject)'),
      description: [row.original.contact?.name ?? row.original.contact?.email ?? t('contact.anonymous', 'Unnamed contact'), row.original.preview].filter(Boolean).join(' · '),
    })),
  },
  {
    id: 'channel',
    header: t('list.channel', 'Channel'),
    cell: ({ row }) => h('span', { class: 'inline-flex items-center gap-1.5 text-muted' }, [
      h(UIcon, { name: channels[row.original.channel]?.icon ?? 'i-lucide-inbox', class: 'size-4 shrink-0' }),
      tr(channels[row.original.channel]?.label) || row.original.channel,
    ]),
  },
  {
    id: 'mailbox',
    header: t('list.mailbox', 'Mailbox'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, mailboxName(row.original.mailboxId)),
  },
  {
    accessorKey: 'status',
    header: header('status', t('list.status', 'Status')),
    cell: ({ row }) => h('span', { class: 'inline-flex items-center gap-1.5' }, [
      h(StatusBadge, { status: row.original.status, label: t(`status.${row.original.status}`, INBOX_STATUS_LABELS[row.original.status] ?? row.original.status), colors: statusColors }),
      row.original.hiddenBelow ? h(UIcon, { name: 'i-lucide-eye-off', class: 'size-4 text-muted', title: t('thread.hiddenBelow', 'Hidden below {role}', { role: row.original.hiddenBelow }) }) : null,
    ]),
  },
  {
    id: 'assignee',
    header: t('list.assignee', 'Assignee'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.assignee ? row.original.assignee.name ?? `#${row.original.assignee.id}` : t('list.nobodyShort', '—')),
  },
  {
    accessorKey: 'lastMessageAt',
    header: header('lastMessageAt', t('list.lastMessage', 'Last message')),
    cell: ({ row }) => h('span', { class: 'tabular-nums text-muted' }, format.dateTime(row.original.lastMessageAt)),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onChanged: refresh, can: { reply: true, assign: true, hide: false } }), subject: row.original.subject ?? '' }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('list.title', 'Inbox')"
      :description="t('list.description', 'Messages from the contact form, email, WhatsApp, Messenger and Instagram, answered from one place.')"
    >
      <template #actions>
        <UButton
          v-if="links.settings()"
          :to="links.settings()"
          icon="i-lucide-settings"
          color="neutral"
          variant="outline"
          :label="t('settings.title', 'Inbox settings')"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('list.forbidden', 'You do not have access to the inbox') : t('list.loadFailed', 'The inbox could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('list.search', 'Search subjects')"
          :aria-label="t('list.search', 'Search subjects')"
          class="w-full sm:max-w-xs"
        />
        <USelect
          v-model="filters.mailbox"
          :items="mailboxOptions"
          :aria-label="t('list.mailbox', 'Mailbox')"
          class="w-44"
        />
        <USelect
          v-model="filters.status"
          :items="statusOptions"
          :aria-label="t('list.status', 'Status')"
          class="w-40"
        />
        <USelect
          v-model="filters.assignee"
          :items="assigneeOptions"
          :aria-label="t('list.assignee', 'Assignee')"
          class="w-40"
        />
        <USelect
          v-model="filters.channel"
          :items="channelOptions"
          :aria-label="t('list.channel', 'Channel')"
          class="w-40"
        />
        <UButton
          v-if="filtered"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          :label="t('list.clearFilters', 'Clear filters')"
          @click="reset"
        />
      </PageToolbar>

      <TableCard
        :loading="loading"
        :refreshing="refreshing"
      >
        <UTable
          v-model:sorting="sorting"
          :data="rows"
          :columns="columns"
          :sorting-options="{ manualSorting: true }"
          :ui="tableUi()"
          @select="(_: Event, row: { original: InboxThreadListItemDto }) => { const to = links.thread(row.original.id); if (to) navigateTo(to) }"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('list.noMatches', 'No threads match your filters')"
              :actions="[{ label: t('list.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-inbox"
              :title="t('list.empty', 'No messages yet')"
              :description="t('list.emptyDescription', 'Messages show up here once a channel is connected to a mailbox you read.')"
              :actions="links.settings() ? [{ label: t('settings.title', 'Inbox settings'), icon: 'i-lucide-settings', to: links.settings() }] : []"
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
