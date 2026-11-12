<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { authorizationApi } from '../../utils/api'
import type { AuthorizationRoleSummaryDto, AuthorizationRoleUserDto, AuthorizationRoleUsersPageDto } from '../../utils/api'
import { useRoleLabels } from './useRoleLabels'
import { computed, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useFormat, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'AuthorizationRoleUsers' })

// The users with an assigned row for `role`, paginated; rows open the users admin when it is installed. Default and
// `auto` roles are never stored: everyone (meeting the requirements) holds them, so there is no list.
const props = defineProps<{ role: AuthorizationRoleSummaryDto }>()

const { t, userPath, sourceLabel, sourceColors } = useRoleLabels()
const format = useFormat()
const stored = computed(() => !props.role.default && !props.role.auto)
const { page, pageSize, search, sort: sortState, query, filtered, reset } = useTableQuery({ sort: { id: 'name', desc: false } })
const sort = useTableSort(null, sortState)
const { sorting } = sort

const { data, status, error, refresh } = useFetch<AuthorizationRoleUsersPageDto>(() => authorizationApi.admin.roleUsers(props.role.name), { query, immediate: stored.value })
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const linked = computed(() => userPath(0) !== undefined)

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')

const columns = computed<TableColumn<AuthorizationRoleUserDto>[]>(() => [
  {
    accessorKey: 'name',
    header: sort.header('name', t('admin.user', 'User')),
    cell: ({ row }) => h(TableIdentity, { title: row.original.name, description: row.original.email, avatar: { alt: row.original.name } }),
  },
  {
    accessorKey: 'source',
    header: t('admin.sourceHeader', 'Source'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.source, colors: sourceColors, label: sourceLabel(row.original.source) }),
  },
  {
    accessorKey: 'assignedAt',
    header: sort.header('assignedAt', t('admin.assignedAt', 'Assigned')),
    cell: ({ row }) => format.date(row.original.assignedAt),
  },
  {
    accessorKey: 'id',
    header: sort.header('id', 'ID'),
    meta: { class: { th: 'w-0', td: 'w-0 text-dimmed tabular-nums' } },
  },
])

function openUser(_event: Event, row: { original: AuthorizationRoleUserDto }) {
  const path = userPath(row.original.id)
  if (path) return navigateTo(path)
}
</script>

<template>
  <UEmpty
    v-if="!stored"
    :icon="role.auto ? 'i-lucide-sparkles' : 'i-lucide-users'"
    :title="role.auto ? t('admin.autoRole', 'Held automatically') : t('admin.defaultRole', 'Held by every signed-in user')"
    :description="role.auto
      ? t('admin.autoRoleHint', 'Everyone who meets its requirements holds this role. It cannot be assigned.')
      : t('admin.defaultRoleHint', 'This is a default role. It cannot be assigned.')"
  />
  <UEmpty
    v-else-if="error && !data"
    icon="i-lucide-circle-alert"
    :title="t('admin.usersLoadFailed', 'The users could not be loaded')"
    :description="errorMessage(error, '')"
    :actions="[{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
  />
  <TableCard
    v-else
    :title="t('admin.usersWithRole', 'Users with this role')"
    :loading="loading"
    :refreshing="refreshing"
  >
    <template #actions>
      <UInput
        v-model="search"
        class="w-full max-w-xs"
        icon="i-lucide-search"
        size="sm"
        :loading="pending"
        :placeholder="t('admin.searchUsers', 'Search name or email...')"
      />
    </template>
    <UTable
      v-model:sorting="sorting"
      :data="data?.items ?? []"
      :columns="columns"
      :sorting-options="{ manualSorting: true }"
      :ui="tableUi(linked ? {} : { tr: '' })"
      @select="openUser"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-users"
          variant="naked"
          :title="filtered ? t('admin.noUsersMatch', 'No users match') : t('admin.noUsers', 'No users have this role')"
          :actions="filtered ? [{ label: t('admin.clearSearch', 'Clear search'), color: 'neutral', variant: 'outline', onClick: reset }] : []"
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
