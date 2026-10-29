<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { UserRow, UsersPage } from '../utils/admin-user'
import { ADMIN_USERS_KEY } from '../utils/admin-user'
import { useUserActions } from '../composables/useUserActions'

defineOptions({ name: 'UsersAdminPage' })

const t = useModuleT('users')
const format = useFormat()
const actions = useUserActions()

// `all` stands for no filter (a select cannot hold an empty value).
const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'createdAt', desc: true },
  filters: { verified: 'all', role: 'all' },
})
const sort = useTableSort(null, sortState)
const { sorting } = sort

const { data, status, error, refresh } = await useFetch<UsersPage>('/api/admin/users', {
  key: ADMIN_USERS_KEY,
  query,
})
const rows = computed(() => data.value?.items ?? [])
const hasRoles = computed(() => data.value?.hasRoles ?? false)
const hasSubscriptions = computed(() => data.value?.hasSubscriptions ?? false)
const roles = computed(() => data.value?.roles ?? [])
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
const roleLabel = (value: string) => t(`admin.roleNames.${value}`, value.charAt(0).toUpperCase() + value.slice(1))
const roleItems = computed(() => roles.value.map(value => ({ label: roleLabel(value), value })))
const roleFilterItems = computed(() => [{ label: t('admin.filters.allRoles', 'All roles'), value: 'all' }, ...roleItems.value])
const pending = computed(() => status.value === 'pending')
// The previous page stays on screen (dimmed) while the next one loads; skeletons only on the very first load.
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)

const StatusBadge = resolveComponent('StatusBadge')
const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')

type Cell = { row: { original: UserRow } }

// The date reads quickly; hovering shows the time too.
const dateCell = (value?: string | null) => value
  ? h('time', { datetime: value, title: format.dateTime(value), class: 'tabular-nums' }, format.date(value))
  : emptyCell()

const columns = computed<TableColumn<UserRow>[]>(() => [
  {
    accessorKey: 'name',
    header: sort.header('name', t('admin.user', 'User')),
    cell: ({ row }: Cell) => h(TableIdentity, {
      title: row.original.name,
      description: row.original.email,
      avatar: { alt: row.original.name },
    }),
  },
  ...(hasRoles.value
    ? [{
        accessorKey: 'role',
        header: sort.header('role', t('admin.role', 'Role')),
        cell: ({ row }: Cell) => row.original.role ? roleLabel(row.original.role) : emptyCell(),
      }]
    : []),
  ...(hasSubscriptions.value
    ? [{
        id: 'subscription',
        header: t('admin.subscription', 'Membership'),
        cell: ({ row }: Cell) => {
          const subscription = row.original.subscription
          return subscription
            ? h(StatusBadge, { status: subscription.status, label: subscription.planKey ?? subscription.status })
            : emptyCell()
        },
      }]
    : []),
  {
    id: 'verified',
    header: t('admin.verified', 'Verified'),
    cell: ({ row }) => h(StatusBadge, {
      status: row.original.emailVerifiedAt ? 'verified' : 'unverified',
      colors: { verified: 'success' },
      label: row.original.emailVerifiedAt ? t('admin.filters.verified', 'Verified') : t('admin.filters.unverified', 'Unverified'),
    }),
  },
  { accessorKey: 'lastLoginAt', header: sort.header('lastLoginAt', t('admin.lastLogin', 'Last sign-in')), cell: ({ row }: Cell) => dateCell(row.original.lastLoginAt) },
  { accessorKey: 'createdAt', header: sort.header('createdAt', t('admin.created', 'Created')), cell: ({ row }: Cell) => dateCell(row.original.createdAt) },
  {
    accessorKey: 'id',
    header: sort.header('id', 'ID'),
    meta: { class: { th: 'w-0', td: 'w-0 text-dimmed tabular-nums' } },
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original), subject: row.original.name }),
  },
])

const verifiedOptions = computed(() => [
  { label: t('admin.filters.all', 'All'), value: 'all' },
  { label: t('admin.filters.verified', 'Verified'), value: 'true' },
  { label: t('admin.filters.unverified', 'Unverified'), value: 'false' },
])

function openUser(_event: Event, row: { original: UserRow }) {
  return navigateTo(actions.userPath(row.original.id))
}

// The composable opens the form and navigates to the new user's page.
const addUser = () => actions.create({ roles: hasRoles.value ? roles.value : [] })
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading :title="t('admin.title', 'Users')">
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'Add user')"
          @click="addUser"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to users') : t('admin.loadFailed', 'Users could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          class="w-full max-w-sm"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('admin.search', 'Search name, email or role...')"
        />
        <USelect
          v-model="filters.verified"
          :items="verifiedOptions"
          class="w-40"
        />
        <USelect
          v-if="hasRoles"
          v-model="filters.role"
          :items="roleFilterItems"
          class="w-48"
          icon="i-lucide-shield"
        />
        <UButton
          v-if="filtered"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          :label="t('admin.filters.clear', 'Clear filters')"
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
          :ui="tableUi({}, { sticky: true })"
          sticky
          @select="openUser"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-users"
              variant="naked"
              :title="t('admin.empty', 'No users match')"
              :actions="[filtered
                ? { label: t('admin.filters.clear', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }
                : { label: t('admin.create', 'Add user'), icon: 'i-lucide-plus', onClick: addUser }]"
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
