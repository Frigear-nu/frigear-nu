<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffTeam, StaffTeamsPage } from '../utils/admin-team'
import { TEAM_OWNER_TYPES, teamOwnerText } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import { computed, emptyCell, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useModuleT, useTableQuery, useTableSort, useTeamActions, useTeamLinks, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamsAdminPage' })

const t = useModuleT('teams')
const tr = useTeamsTranslate()
const links = useTeamLinks()
const actions = useTeamActions()

// Paginated on the server; page, search (name in every language), owner filter and sort live in the URL, so the
// Teams tab of an operation can link here with `?ownerType=operation&ownerId=...`. `all` / `''` stand for no filter.
const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'sort', desc: false },
  filters: { ownerType: 'all', ownerId: '' },
})
const { sorting, header } = useTableSort(null, sortState)

const apiQuery = computed(() => {
  const { ownerType, ...rest } = query.value as Record<string, unknown>
  return ownerType && ownerType !== 'all' ? { ...rest, ownerType } : rest
})
const { data, status, error, refresh } = await useFetch<StaffTeamsPage>(teamsApi.admin.teams, { query: apiQuery })

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

const ownerTypeOptions = computed(() => [
  { label: t('admin.allOwners', 'All owners'), value: 'all' },
  ...TEAM_OWNER_TYPES.map(value => ({ label: t(`admin.ownerTypes.${value}`, value === 'platform' ? 'Platform' : 'Operation'), value })),
])
const platform = computed(() => t('admin.ownerTypes.platform', 'Platform'))

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')

const columns = computed<TableColumn<StaffTeam>[]>(() => [
  {
    id: 'name',
    accessorFn: row => tr(row.name),
    header: t('admin.name', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: tr(row.original.description) || null }),
  },
  {
    accessorKey: 'kind',
    header: header('kind', t('admin.kind', 'Kind')),
  },
  {
    id: 'owner',
    header: t('admin.ownerType', 'Owner'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, teamOwnerText(row.original, tr, platform.value)),
  },
  {
    accessorKey: 'memberCount',
    header: t('admin.members', 'Members'),
    cell: ({ row }) => row.original.capacity
      ? h('span', { class: 'tabular-nums' }, `${row.original.memberCount} / ${row.original.capacity}`)
      : row.original.memberCount ? h('span', { class: 'tabular-nums' }, String(row.original.memberCount)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh, onChanged: refresh }), subject: tr(row.original.name) }),
  },
])

const ownerFixed = computed(() => filters.ownerType !== 'all' && (filters.ownerType === 'platform' || !!filters.ownerId))
const create = () => actions.create(ownerFixed.value ? { owner: { ownerType: filters.ownerType, ownerId: filters.ownerType === 'platform' ? null : filters.ownerId } } : {})
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Teams')"
      :description="t('admin.listDescription', 'Teams of the platform and of each operation, with their members and role mapping rules.')"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'Add team')"
          @click="create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to teams') : t('admin.loadFailed', 'Teams could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('admin.search', 'Search teams')"
          :aria-label="t('admin.search', 'Search teams')"
          class="w-full sm:max-w-xs"
        />
        <USelect
          v-model="filters.ownerType"
          :items="ownerTypeOptions"
          :aria-label="t('admin.ownerType', 'Owner')"
          class="w-44"
        />
        <UInput
          v-if="filters.ownerType !== 'all' && filters.ownerType !== 'platform'"
          v-model="filters.ownerId"
          :placeholder="t('admin.ownerId', 'Owner id')"
          :aria-label="t('admin.ownerId', 'Owner id')"
          class="w-56"
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
          @select="(_: Event, row: { original: StaffTeam }) => navigateTo(links.adminTeam(row.original.id))"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No teams match your search')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-users-round"
              :title="t('admin.empty', 'No teams yet')"
              :description="t('admin.emptyDescription', 'Add a team, such as a bar of an operation, to give people roles on it.')"
              :actions="[{ label: t('admin.create', 'Add team'), icon: 'i-lucide-plus', onClick: () => create() }]"
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
