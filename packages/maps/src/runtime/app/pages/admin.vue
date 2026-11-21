<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Page } from '@frigear-nu/module-kit/server'
import { kinds } from '#maps/registry'
import { mapsApi } from '../../utils/api'
import type { AdminMapDto } from '../../../types'
import { computed, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useFormat, useMapActions, useMapLinks, useMapsTranslate, useModuleT, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'MapsAdminPage' })

const t = useModuleT('maps')
const tr = useMapsTranslate()
const format = useFormat()
const links = useMapLinks()
const actions = useMapActions()

// Paginated on the server; page, search (name in every language, key), owner type and sort live in the URL. `all`
// stands for no filter (a select cannot hold an empty value).
const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'updatedAt', desc: true },
  filters: { ownerType: 'all' },
})
const { sorting, header } = useTableSort(null, sortState)
const { data, status, error, refresh } = await useFetch<Page<AdminMapDto>>(mapsApi.admin.maps, { query })

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

const ownerOptions = computed(() => [
  { label: t('admin.allOwners', 'All owners'), value: 'all' },
  { label: t('admin.owners.platform', 'Platform'), value: 'platform' },
  { label: t('admin.owners.operation', 'Operations'), value: 'operation' },
  { label: t('admin.owners.team', 'Teams'), value: 'team' },
])

const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')
const UBadge = resolveComponent('UBadge')

const columns = computed<TableColumn<AdminMapDto>[]>(() => [
  {
    id: 'name',
    header: t('admin.name', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: row.original.key ?? undefined }),
  },
  {
    accessorKey: 'kind',
    header: header('kind', t('admin.kind', 'Kind')),
    cell: ({ row }) => h('span', { class: 'text-muted' }, tr(kinds[row.original.kind]?.label) || row.original.kind),
  },
  {
    id: 'owner',
    header: t('admin.owner', 'Owner'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, tr(row.original.ownerLabel) || (row.original.ownerType === 'platform' ? t('admin.owners.platform', 'Platform') : `${row.original.ownerType} ${row.original.ownerId ?? ''}`)),
  },
  {
    id: 'visibility',
    header: t('admin.visibility', 'Who can see it'),
    cell: ({ row }) => h(UBadge, { color: row.original.public ? 'success' : 'neutral', variant: 'subtle', label: row.original.public ? t('visibility.publicShort', 'Public') : t('visibility.restrictedShort', 'Signed in') }),
  },
  {
    accessorKey: 'updatedAt',
    header: header('updatedAt', t('admin.updated', 'Updated')),
    cell: ({ row }) => h('span', { class: 'tabular-nums text-muted' }, format.dateTime(row.original.updatedAt)),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh, onChanged: refresh }), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Maps')"
      :description="t('admin.listDescription', 'Site maps, floor plans and every other map, with what is drawn on them.')"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'Add map')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to maps') : t('admin.loadFailed', 'Maps could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('admin.search', 'Search maps')"
          :aria-label="t('admin.search', 'Search maps')"
          class="w-full sm:max-w-xs"
        />
        <USelect
          v-model="filters.ownerType"
          :items="ownerOptions"
          :aria-label="t('admin.owner', 'Owner')"
          class="w-44"
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
          @select="(_: Event, row: { original: AdminMapDto }) => { const to = links.adminMap(row.original.id); if (to) navigateTo(to) }"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No maps match your search')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-map"
              :title="t('admin.empty', 'No maps yet')"
              :description="t('admin.emptyDescription', 'Add a site map or a floor plan. Modules can also create their own maps.')"
              :actions="[{ label: t('admin.create', 'Add map'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
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
