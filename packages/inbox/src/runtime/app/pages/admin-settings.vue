<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { channels } from '#inbox/registry'
import { inboxApi } from '../../utils/api'
import { isOnInboxDomain } from '../../utils/email-routing'
import type { InboxChannelAccountDto, InboxEmailSettingsDto, InboxMailboxDto } from '../../../types'
import { computed, errorMessage, h, resolveComponent, tableUi, useFetch, useInboxChannelActions, useInboxLinks, useInboxMailboxActions, useInboxTranslate, useModuleT } from '#imports'

defineOptions({ name: 'InboxAdminSettingsPage' })

const t = useModuleT('inbox')
const tr = useInboxTranslate()
const links = useInboxLinks()
const mailboxActions = useInboxMailboxActions()
const channelActions = useInboxChannelActions()

const { data: mailboxes, status: mailboxStatus, error: mailboxError, refresh: refreshMailboxes } = await useFetch<InboxMailboxDto[]>(inboxApi.admin.mailboxes, { key: 'inbox:mailboxes', default: () => [] })
const { data: accounts, status: accountStatus, error: accountError, refresh: refreshAccounts } = await useFetch<InboxChannelAccountDto[]>(inboxApi.admin.channels, { default: () => [] })
const { data: emailSettings } = await useFetch<InboxEmailSettingsDto>(inboxApi.admin.email, { default: () => ({ domains: [], drivers: [] }) })
const channelsForbidden = computed(() => accountError.value?.statusCode === 401 || accountError.value?.statusCode === 403)

/**
 * Mailboxes that are answered by email (an email or contact form channel) without an email address on an inbox domain:
 * their replies have no reply address, so answers thread by their subject only.
 */
const withoutInboxAddress = computed(() => {
  const domains = emailSettings.value?.domains ?? []
  if (!domains.length || !accounts.value?.length) return []
  const answeredByEmail = new Set(accounts.value.filter(account => account.channel === 'email' || account.channel === 'form').map(account => account.mailboxId))
  const onDomain = new Set(accounts.value.filter(account => account.channel === 'email' && account.enabled && isOnInboxDomain(account.address, domains)).map(account => account.mailboxId))
  return (mailboxes.value ?? []).filter(mailbox => answeredByEmail.has(mailbox.id) && !onDomain.has(mailbox.id))
})

async function refreshAll() {
  await Promise.all([refreshMailboxes(), refreshAccounts()])
}
async function addMailbox() {
  if (await mailboxActions.create()) await refreshAll()
}
async function addChannel() {
  if (await channelActions.create(mailboxes.value ?? [])) await refreshAccounts()
}

const mailboxName = (id: string) => tr(mailboxes.value?.find(mailbox => mailbox.id === id)?.name) || id
const readers = (mailbox: InboxMailboxDto) => {
  const parts: string[] = []
  if (mailbox.ownerType === 'team') parts.push(t('settings.teamLeads', 'Team leads'))
  const roles = mailbox.grants.flatMap(grant => grant.kind === 'role' && typeof grant.role === 'string' ? [grant.role] : [])
  if (roles.length) parts.push(roles.join(', '))
  const others = mailbox.grants.filter(grant => grant.kind !== 'role').length
  if (others) parts.push(t('settings.moreGrants', '{count} more', { count: others }))
  return parts.join(' · ') || t('settings.staffOnly', 'Staff only')
}

const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')
const StatusBadge = resolveComponent('StatusBadge')
const UIcon = resolveComponent('UIcon')

const mailboxColumns = computed<TableColumn<InboxMailboxDto>[]>(() => [
  { id: 'name', header: t('settings.name', 'Name'), cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: row.original.key }) },
  { id: 'owner', header: t('settings.owner', 'Owner'), cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.ownerType === 'team' ? `${t('settings.ownerTeam', 'A team')} ${row.original.ownerId ?? ''}` : t('settings.ownerPlatform', 'Platform')) },
  { id: 'readers', header: t('settings.readers', 'Who reads it'), cell: ({ row }) => h('span', { class: 'text-muted' }, readers(row.original)) },
  { id: 'retention', header: t('settings.retentionShort', 'Keeps closed threads'), cell: ({ row }) => h('span', { class: 'tabular-nums text-muted' }, row.original.retentionDays ? t('settings.days', '{count} days', { count: row.original.retentionDays }) : t('settings.defaultRetention', 'Default')) },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: mailboxActions.menu(row.original, { onChanged: refreshAll }), subject: tr(row.original.name) }),
  },
])

const accountColumns = computed<TableColumn<InboxChannelAccountDto>[]>(() => [
  {
    id: 'channel',
    header: t('channels.channel', 'Channel'),
    cell: ({ row }) => h('span', { class: 'inline-flex items-center gap-2' }, [
      h(UIcon, { name: channels[row.original.channel]?.icon ?? 'i-lucide-plug', class: 'size-4 shrink-0 text-muted' }),
      h(TableIdentity, { title: row.original.address, description: tr(channels[row.original.channel]?.label) || row.original.channel }),
    ]),
  },
  { id: 'mailbox', header: t('channels.mailbox', 'Mailbox'), cell: ({ row }) => h('span', { class: 'text-muted' }, mailboxName(row.original.mailboxId)) },
  {
    id: 'secret',
    header: t('channels.secret', 'Token'),
    cell: ({ row }) => row.original.secretRef
      ? h(StatusBadge, { status: row.original.secretConfigured ? 'set' : 'missing', label: row.original.secretConfigured ? row.original.secretRef : t('channels.secretMissing', '{name} missing', { name: row.original.secretRef }), colors: { set: 'success', missing: 'error' } })
      : h('span', { class: 'text-muted' }, '—'),
  },
  {
    id: 'enabled',
    header: t('channels.state', 'State'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.enabled ? 'on' : 'off', label: row.original.enabled ? t('channels.on', 'On') : t('channels.off', 'Off'), colors: { on: 'success', off: 'neutral' } }),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: channelActions.menu(row.original, mailboxes.value ?? [], { onChanged: refreshAccounts }), subject: row.original.address }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('settings.title', 'Inbox settings')"
      :description="t('settings.description', 'Mailboxes, who reads them, and the channels that deliver into them.')"
      :breadcrumb="[{ label: t('list.title', 'Inbox'), to: links.admin() }, { label: t('settings.title', 'Inbox settings') }]"
    />

    <TableCard
      :title="t('settings.mailboxes', 'Mailboxes')"
      :loading="mailboxStatus === 'pending' && !mailboxes?.length"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          :label="t('settings.addMailbox', 'Add mailbox')"
          @click="addMailbox"
        />
      </template>
      <UEmpty
        v-if="mailboxError"
        variant="naked"
        icon="i-lucide-circle-alert"
        :title="t('settings.mailboxesFailed', 'The mailboxes could not be loaded')"
        :description="errorMessage(mailboxError, '')"
      />
      <UTable
        v-else
        :data="mailboxes ?? []"
        :columns="mailboxColumns"
        :ui="tableUi()"
      >
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-inbox"
            :title="t('settings.noMailboxes', 'No mailboxes yet')"
            :description="t('settings.noMailboxesDescription', 'Add a shared mailbox, such as Support, then connect channels to it.')"
            :actions="[{ label: t('settings.addMailbox', 'Add mailbox'), icon: 'i-lucide-plus', onClick: addMailbox }]"
          />
        </template>
      </UTable>
    </TableCard>

    <UAlert
      v-if="withoutInboxAddress.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-mail-warning"
      :title="t('settings.noInboxAddress', 'Some mailboxes have no address on an inbox domain')"
      :description="t('settings.noInboxAddressDescription', '{names} answer by email without a reply address on {domains}, so answers only find their thread by the subject. Connect an email address on one of these domains.', { names: withoutInboxAddress.map(mailbox => tr(mailbox.name) || mailbox.key).join(', '), domains: (emailSettings?.domains ?? []).join(', ') })"
    />

    <TableCard
      :title="t('settings.channels', 'Channels')"
      :description="t('settings.channelsDescription', 'Each connects an address on a channel to a mailbox. Tokens stay in the server config.')"
      :loading="accountStatus === 'pending' && !accounts?.length"
    >
      <template #actions>
        <UButton
          v-if="!accountError"
          icon="i-lucide-plus"
          size="sm"
          :disabled="!mailboxes?.length"
          :label="t('settings.addChannel', 'Connect channel')"
          @click="addChannel"
        />
      </template>
      <UEmpty
        v-if="accountError"
        variant="naked"
        :icon="channelsForbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
        :title="channelsForbidden ? t('settings.channelsForbidden', 'Only admins signed in with a session manage channels') : t('settings.channelsFailed', 'The channels could not be loaded')"
        :description="channelsForbidden ? undefined : errorMessage(accountError, '')"
      />
      <UTable
        v-else
        :data="accounts ?? []"
        :columns="accountColumns"
        :ui="tableUi()"
      >
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-plug"
            :title="t('settings.noChannels', 'No channels connected')"
            :description="t('settings.noChannelsDescription', 'Connect the contact form, an email address, a WhatsApp number or a Meta page.')"
            :actions="mailboxes?.length ? [{ label: t('settings.addChannel', 'Connect channel'), icon: 'i-lucide-plus', onClick: addChannel }] : []"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
