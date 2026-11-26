<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CampaignListDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { computed, errorMessage, h, navigateTo, resolveComponent, tableUi, useCampaignListActions, useCampaignsLinks, useCampaignsTranslate, useFetch, useModuleT } from '#imports'

defineOptions({ name: 'CampaignsAdminListsPage' })

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const links = useCampaignsLinks()
const actions = useCampaignListActions()

const { data, status, error, refresh } = await useFetch<CampaignListDto[]>(campaignsApi.admin.lists, { key: 'campaigns:lists', default: () => [] })
const rows = computed(() => data.value ?? [])
const loading = computed(() => status.value === 'pending' && !rows.value.length)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

async function create() {
  const saved = await actions.create()
  if (!saved) return
  const to = links.adminList(saved.id)
  if (to) await navigateTo(to)
  else await refresh()
}

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')
const UBadge = resolveComponent('UBadge')

const channelLabel = (channel: string) => t(`channels.${channel}`, channel === 'sms' ? 'SMS' : 'Email')
const active = (list: CampaignListDto) => list.counts.email.active + list.counts.sms.active
const pending = (list: CampaignListDto) => list.counts.email.pending + list.counts.sms.pending

const columns = computed<TableColumn<CampaignListDto>[]>(() => [
  {
    id: 'name',
    header: t('admin.fields.name', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: row.original.slug }),
  },
  {
    id: 'channels',
    header: t('admin.fields.channels', 'Channels'),
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, row.original.channels.map(channel => h(UBadge, { color: 'neutral', variant: 'subtle', label: channelLabel(channel) }))),
  },
  {
    id: 'signup',
    header: t('admin.signup', 'Signup'),
    cell: ({ row }) => h(StatusBadge, {
      status: row.original.public ? 'active' : 'inactive',
      label: row.original.public ? t('admin.public', 'Public') : t('admin.private', 'Not public'),
    }),
  },
  {
    id: 'active',
    header: t('admin.subscribers', 'Subscribers'),
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    cell: ({ row }) => String(active(row.original)),
  },
  {
    id: 'pending',
    header: t('admin.pending', 'Waiting to confirm'),
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
    cell: ({ row }) => String(pending(row.original)),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onChanged: refresh, onRemoved: refresh }), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <CampaignsAdminHeading>
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'Create newsletter')"
          @click="create"
        />
      </template>
    </CampaignsAdminHeading>

    <UEmpty
      v-if="error"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to newsletters') : t('admin.loadFailed', 'Newsletters could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <TableCard
      v-else
      :loading="loading"
    >
      <UTable
        :data="rows"
        :columns="columns"
        :ui="tableUi()"
        @select="(_: Event, row: { original: CampaignListDto }) => { const to = links.adminList(row.original.id); if (to) navigateTo(to) }"
      >
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-newspaper"
            :title="t('admin.empty', 'No newsletters yet')"
            :description="t('admin.emptyDescription', 'Create a newsletter, then add its signup to a page.')"
            :actions="[{ label: t('admin.create', 'Create newsletter'), icon: 'i-lucide-plus', onClick: create }]"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
