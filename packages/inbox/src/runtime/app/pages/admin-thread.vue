<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import { channels } from '#inbox/registry'
import { inboxApi } from '../../utils/api'
import { INBOX_AUDIT_LABELS, INBOX_STATUS_LABELS } from '../../utils'
import type { InboxAuditDto, InboxThreadDetailDto, InboxThreadStatus, InboxUserRef } from '../../../types'
import { computed, errorMessage, h, navigateTo, tableUi, useFetch, useFormat, useInboxLinks, useInboxThreadActions, useInboxTranslate, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'InboxAdminThreadPage' })

const t = useModuleT('inbox')
const tr = useInboxTranslate()
const format = useFormat()
const route = useRoute()
const links = useInboxLinks()
const actions = useInboxThreadActions()
const id = computed(() => String(route.params.id))

const { data, error, refresh } = await useFetch<InboxThreadDetailDto>(() => inboxApi.admin.thread(id.value))
const thread = computed(() => data.value?.thread)
const notFound = computed(() => error.value?.statusCode === 404)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const can = computed(() => data.value?.can)

// The audit trail of this thread, for people who may read the audit log.
const { data: audit, status: auditStatus, refresh: refreshAudit } = await useFetch<Page<InboxAuditDto>>(inboxApi.admin.audit, {
  query: computed(() => ({ threadId: id.value, pageSize: 20 })),
  immediate: !!can.value?.audit,
  default: () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
})

async function refreshAll() {
  await refresh()
  if (can.value?.audit) await refreshAudit()
}

const statusColors = { open: 'info', pending: 'warning', closed: 'neutral' } as const
const statusItems = computed(() => (['open', 'pending', 'closed'] as const).map(value => ({ label: t(`status.${value}`, INBOX_STATUS_LABELS[value] ?? value), value })))
async function changeStatus(value: InboxThreadStatus) {
  if (thread.value && value !== thread.value.status && await actions.setStatus(thread.value, value)) await refreshAll()
}
// The assignee picker lists the people who could read and answer the thread, loaded when it is first opened.
const { data: assignees, status: assigneesStatus, execute: loadAssignees } = await useFetch<InboxUserRef[]>(() => inboxApi.admin.assignees(id.value), {
  immediate: false,
  default: () => [],
})
const userLabel = (person: InboxUserRef) => person.name ?? `#${person.id}`
const assigneeItems = computed(() => {
  const people = [...(assignees.value ?? [])]
  const current = data.value?.assignee
  if (current && !people.some(person => person.id === current.id)) people.unshift(current)
  return [
    { label: t('list.nobody', 'Unassigned'), value: 'none' },
    ...people.map(person => ({ label: userLabel(person), value: String(person.id) })),
  ]
})
async function onAssigneeOpen(open: boolean) {
  if (open && assigneesStatus.value === 'idle') await loadAssignees()
}
async function changeAssignee(value: string) {
  if (!thread.value) return
  const assigneeId = value === 'none' ? null : Number(value)
  if (assigneeId !== thread.value.assigneeId && await actions.assign(thread.value, assigneeId)) await refreshAll()
}

const contactName = computed(() => data.value?.contact?.name ?? null)
const facts = computed(() => data.value
  ? [
      { key: 'mailbox', label: t('thread.mailbox', 'Mailbox'), value: tr(data.value.mailbox.name) },
      { key: 'channel', label: t('list.channel', 'Channel'), value: tr(channels[data.value.thread.channel]?.label) || data.value.thread.channel },
      { key: 'assignee', label: t('list.assignee', 'Assignee'), value: data.value.assignee ? (data.value.assignee.name ?? `#${data.value.assignee.id}`) : t('list.nobody', 'Unassigned') },
      { key: 'hidden', label: t('thread.visibleTo', 'Seen by'), value: data.value.thread.hiddenBelow ? t('hide.role', '{role} and up', { role: data.value.thread.hiddenBelow }) : t('hide.everyone', 'Everyone with access to the mailbox') },
      { key: 'started', label: t('thread.started', 'Started'), value: format.dateTime(data.value.thread.createdAt) },
    ]
  : [])
const contactFacts = computed(() => {
  const contact = data.value?.contact
  if (!contact) return []
  return [
    { key: 'name', label: t('contact.name', 'Name'), value: contact.name ?? '—' },
    ...(can.value?.pii
      ? [
          { key: 'email', label: t('contact.email', 'Email'), value: contact.email ?? '—' },
          { key: 'phone', label: t('contact.phone', 'Phone'), value: contact.phone ?? '—' },
          { key: 'externalId', label: t('contact.externalId', 'Channel id'), value: contact.externalId ?? '—' },
        ]
      : []),
  ]
})

const auditColumns = computed<TableColumn<InboxAuditDto>[]>(() => [
  { id: 'action', header: t('audit.action', 'What'), cell: ({ row }) => {
    const label = t(`audit.actions.${row.original.action}`, INBOX_AUDIT_LABELS[row.original.action] ?? row.original.action)
    // A linked action (`inbox:thread:linked`) says what the other module did.
    const detail = row.original.action === 'linked' && typeof row.original.data?.label === 'string' ? row.original.data.label : null
    return detail ? `${label}: ${detail}` : label
  } },
  { id: 'actor', header: t('audit.actor', 'Who'), cell: ({ row }) => row.original.actor?.name ?? (row.original.actorId ? `#${row.original.actorId}` : t('audit.system', 'System')) },
  { accessorKey: 'createdAt', header: t('audit.when', 'When'), cell: ({ row }) => h('span', { class: 'tabular-nums text-muted' }, format.dateTime(row.original.createdAt)) },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="data && thread">
      <PageHeading
        :title="thread.subject || t('thread.noSubject', '(no subject)')"
        :breadcrumb="[{ label: t('list.title', 'Inbox'), to: links.admin() }, { label: thread.subject || t('thread.noSubject', '(no subject)') }]"
      >
        <template #badge>
          <StatusBadge
            :status="thread.status"
            :label="t(`status.${thread.status}`, INBOX_STATUS_LABELS[thread.status] ?? thread.status)"
            :colors="statusColors"
          />
        </template>
        <template #actions>
          <USelect
            v-if="can?.reply"
            :model-value="thread.status"
            :items="statusItems"
            :aria-label="t('list.status', 'Status')"
            class="w-36"
            @update:model-value="(value: InboxThreadStatus) => changeStatus(value)"
          />
          <USelectMenu
            v-if="can?.assign"
            :model-value="thread.assigneeId === null ? 'none' : String(thread.assigneeId)"
            :items="assigneeItems"
            value-key="value"
            icon="i-lucide-user-check"
            :loading="assigneesStatus === 'pending'"
            :search-input="{ placeholder: t('thread.assigneeSearch', 'Search people') }"
            :aria-label="t('thread.assignTo', 'Assign thread')"
            class="w-52"
            data-assignee-picker
            @update:open="onAssigneeOpen"
            @update:model-value="(value: string) => changeAssignee(value)"
          >
            <template #empty>
              {{ t('thread.assigneesEmpty', 'Nobody else can read this thread') }}
            </template>
          </USelectMenu>
          <RowMenu
            variant="outline"
            :subject="thread.subject ?? ''"
            :items="actions.menu(thread, { open: false, onChanged: refreshAll, can: { reply: false, assign: can?.assign, hide: can?.hide }, hideRoles: data.hideRoles })"
          />
        </template>
      </PageHeading>

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="flex flex-col gap-4 lg:col-span-2">
          <SectionCard
            :title="t('thread.conversation', 'Conversation')"
            icon="i-lucide-messages-square"
          >
            <InboxConversation
              :messages="data.messages"
              :contact-name="contactName"
            />
          </SectionCard>
          <SectionCard
            v-if="can?.reply"
            :title="t('composer.title', 'Answer')"
            icon="i-lucide-reply"
          >
            <InboxComposer
              :thread="thread"
              :disabled="!!data.contact?.erasedAt"
              @sent="refreshAll"
            />
          </SectionCard>
        </div>

        <div class="flex flex-col gap-4">
          <SectionCard
            :title="t('thread.details', 'Details')"
            icon="i-lucide-info"
          >
            <DescriptionList :items="facts" />
          </SectionCard>
          <SectionCard
            v-if="data.contact"
            :title="t('contact.title', 'Contact')"
            icon="i-lucide-user"
            :description="can?.pii ? undefined : t('contact.piiHidden', 'Contact details are only shown to people allowed to see them.')"
          >
            <DescriptionList :items="contactFacts" />
            <p
              v-if="data.contact.erasedAt"
              class="mt-3 text-sm text-muted"
            >
              {{ t('contact.erasedOn', 'Erased {date}', { date: format.dateTime(data.contact.erasedAt) }) }}
            </p>
            <div
              v-else-if="can?.pii"
              class="mt-3 flex flex-wrap gap-2"
            >
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-download"
                :label="t('contact.export', 'Export contact data')"
                @click="actions.exportContact(data.contact)"
              />
              <UButton
                v-if="can?.erase"
                color="error"
                variant="outline"
                size="sm"
                icon="i-lucide-trash-2"
                :label="t('contact.erase', 'Erase contact')"
                @click="async () => { if (data?.contact && await actions.eraseContact(data.contact)) await refreshAll() }"
              />
            </div>
            <!-- Other modules' actions on the thread's person (crew's "Add to crew"): `extendWidgets(nuxt, 'inbox.thread.actions', ...)`. -->
            <WidgetArea
              v-if="!data.contact.erasedAt"
              name="inbox.thread.actions"
              :context="{ threadId: thread.id, contact: data.contact, onChanged: refreshAll }"
              grid-class="mt-3 flex flex-wrap gap-2"
            />
          </SectionCard>
          <TableCard
            v-if="can?.audit"
            :title="t('audit.title', 'Activity')"
            :loading="auditStatus === 'pending' && !audit?.items.length"
          >
            <UTable
              :data="audit?.items ?? []"
              :columns="auditColumns"
              :ui="tableUi()"
            />
          </TableCard>
        </div>
      </div>
    </template>

    <UEmpty
      v-else-if="error"
      :icon="notFound ? 'i-lucide-search-x' : forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="notFound ? t('thread.notFound', 'This thread does not exist') : forbidden ? t('list.forbidden', 'You do not have access to the inbox') : t('thread.loadFailed', 'The thread could not be loaded')"
      :description="notFound || forbidden ? undefined : errorMessage(error, '')"
      :actions="[{ label: t('thread.backToInbox', 'Back to the inbox'), icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'outline', onClick: () => navigateTo(links.admin() ?? '/') }]"
    />
  </div>
</template>
