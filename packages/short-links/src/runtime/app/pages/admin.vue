<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ShortLinkDto, ShortLinksPage } from '../../../types'
import { shortLinksApi } from '../../utils/api'
import { SHORT_LINKS_MANUAL_OWNER, shortLinkName } from '../../utils/codes'
import { computed, emptyCell, errorMessage, h, resolveComponent, tableUi, useFetch, useFormat, useModuleT, useShortLinkActions, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'ShortLinksAdminPage' })

const t = useModuleT('shortLinks')
const format = useFormat()
const actions = useShortLinkActions()

// Paginated on the server; page, search (code, target, title), owner, status and sort live in the URL. `all` stands
// for no filter (a select cannot hold an empty value).
const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'createdAt', desc: true },
  filters: { owner: 'all', status: 'all' },
})
const { sorting, header } = useTableSort(null, sortState)

const [{ data, status, error, refresh }, { data: owners }] = await Promise.all([
  useFetch<ShortLinksPage>(shortLinksApi.admin.links, { query }),
  useFetch<string[]>(shortLinksApi.admin.owners, { default: () => [] }),
])

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
// The previous page stays on screen (dimmed) while the next one loads; skeletons only on the very first load.
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

const ownerLabel = (module: string) => module === SHORT_LINKS_MANUAL_OWNER ? t('admin.ownerManual', 'Made by hand') : module
const ownerOptions = computed(() => [
  { label: t('admin.allOwners', 'All owners'), value: 'all' },
  ...(owners.value ?? []).map(value => ({ label: ownerLabel(value), value })),
])
const statusOptions = computed(() => [
  { label: t('admin.allStatuses', 'All statuses'), value: 'all' },
  { label: t('admin.statuses.active', 'Active'), value: 'active' },
  { label: t('admin.statuses.expired', 'Expired'), value: 'expired' },
  { label: t('admin.statuses.disabled', 'Disabled'), value: 'disabled' },
])

const STATUS_LABELS = { active: 'Active', expired: 'Expired', disabled: 'Disabled' } as const

function linkStatus(link: ShortLinkDto): 'active' | 'expired' | 'disabled' {
  if (link.disabledAt) return 'disabled'
  return link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now() ? 'expired' : 'active'
}

async function changed() {
  await refresh()
}

// A row opens the edit form of a link made by hand; links other modules own have only their row menu.
async function select(link: ShortLinkDto) {
  if (link.editable && await actions.edit(link)) await refresh()
}

async function create() {
  if (await actions.create()) await refresh()
}

const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')
const UBadge = resolveComponent('UBadge')

const columns = computed<TableColumn<ShortLinkDto>[]>(() => [
  {
    accessorKey: 'code',
    header: header('code', t('admin.columns.link', 'Short link')),
    cell: ({ row }) => h(TableIdentity, { title: row.original.title || row.original.shortUrl, description: row.original.title ? row.original.shortUrl : null }),
  },
  {
    id: 'url',
    header: t('admin.columns.target', 'Target'),
    meta: { class: { td: 'max-w-72 truncate' } },
    cell: ({ row }) => h('span', { title: row.original.url, class: 'text-muted' }, row.original.url),
  },
  {
    id: 'owner',
    header: t('admin.columns.owner', 'Owner'),
    cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle', label: ownerLabel(row.original.owner.module) }),
  },
  {
    id: 'status',
    header: t('admin.columns.status', 'Status'),
    cell: ({ row }) => {
      const value = linkStatus(row.original)
      return h(StatusBadge, { status: value, label: t(`admin.statuses.${value}`, STATUS_LABELS[value]), colors: { disabled: 'error' } })
    },
  },
  {
    accessorKey: 'clicks',
    header: header('clicks', t('admin.columns.clicks', 'Clicks')),
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
  },
  {
    accessorKey: 'lastClickedAt',
    header: header('lastClickedAt', t('admin.columns.lastClicked', 'Last click')),
    cell: ({ row }) => row.original.lastClickedAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.lastClickedAt)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onChanged: changed }), subject: shortLinkName(row.original) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Short links')"
      :description="t('admin.description', 'Short links of every module and the ones made by hand, with their clicks.')"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'Create short link')"
          @click="create"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to short links') : t('admin.loadFailed', 'Short links could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('admin.search', 'Search short links')"
          :aria-label="t('admin.search', 'Search short links')"
          class="w-full sm:max-w-xs"
        />
        <USelect
          v-model="filters.owner"
          :items="ownerOptions"
          :aria-label="t('admin.columns.owner', 'Owner')"
          class="w-44"
        />
        <USelect
          v-model="filters.status"
          :items="statusOptions"
          :aria-label="t('admin.columns.status', 'Status')"
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
          v-model:sorting="sorting"
          :data="rows"
          :columns="columns"
          :sorting-options="{ manualSorting: true }"
          :ui="tableUi()"
          @select="(_: Event, row: { original: ShortLinkDto }) => select(row.original)"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No short links match your search')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-link"
              :title="t('admin.empty', 'No short links yet')"
              :description="t('admin.emptyDescription', 'Modules make short links when they send messages; you can also make one by hand.')"
              :actions="[{ label: t('admin.create', 'Create short link'), icon: 'i-lucide-plus', onClick: create }]"
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
