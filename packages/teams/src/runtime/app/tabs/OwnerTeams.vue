<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffTeam, StaffTeamsPage } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import { computed, emptyCell, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useModuleT, useTeamActions, useTeamLinks, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamsOwnerTeamsTab' })

// The "Teams" tab teams adds to an owner's staff page: `extendTabs(nuxt, 'admin.operations', ...)` with the prop
// `ownerType: 'operation'`. The owner page passes its record in the tab context; for operations that is `operation`.
// Teams never imports the owner module: it only reads the record's `id`.
const props = defineProps<{ ownerType: string, operation?: { id: string } }>()

const t = useModuleT('teams')
const tr = useTeamsTranslate()
const links = useTeamLinks()
const actions = useTeamActions()

const owner = computed(() => ({ ownerType: props.ownerType, ownerId: props.operation?.id ?? null }))
// Without the owner's record (a host page that renders the area without it) there is nothing to list: never query
// every team of the owner type.
const hasOwner = computed(() => !!owner.value.ownerId)
const { data, status, error, refresh } = await useFetch<StaffTeamsPage>(teamsApi.admin.teams, {
  query: computed(() => ({ ownerType: owner.value.ownerType, ownerId: owner.value.ownerId ?? undefined, pageSize: 100, sort: 'sort', order: 'asc' })),
  immediate: hasOwner.value,
  watch: false,
})
const rows = computed(() => data.value?.items ?? [])

const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')

const columns = computed<TableColumn<StaffTeam>[]>(() => [
  {
    id: 'name',
    header: t('admin.name', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: row.original.kind }),
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

async function create() {
  if (!hasOwner.value) return
  if (await actions.create({ owner: owner.value, navigate: false })) await refresh()
}
</script>

<template>
  <TableCard
    :title="t('admin.title', 'Teams')"
    :loading="hasOwner && status === 'pending' && !data"
  >
    <template
      v-if="hasOwner"
      #actions
    >
      <UButton
        icon="i-lucide-plus"
        size="sm"
        :label="t('admin.create', 'Add team')"
        @click="create"
      />
    </template>
    <UEmpty
      v-if="!hasOwner"
      variant="naked"
      icon="i-lucide-circle-alert"
      :title="t('admin.noOwner', 'Open this tab from an operation page.')"
    />
    <UEmpty
      v-else-if="error && !data"
      variant="naked"
      icon="i-lucide-circle-alert"
      :title="t('admin.loadFailed', 'Teams could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UTable
      v-else
      :data="rows"
      :columns="columns"
      :ui="tableUi()"
      @select="(_: Event, row: { original: StaffTeam }) => navigateTo(links.adminTeam(row.original.id))"
    >
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-users-round"
          :title="t('admin.ownerEmpty', 'No teams here yet')"
          :description="t('admin.ownerEmptyDescription', 'Add the bars and other teams that work here.')"
          :actions="[{ label: t('admin.create', 'Add team'), icon: 'i-lucide-plus', onClick: create }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
