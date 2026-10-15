<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { UserRow, UsersPage } from '../utils/admin-user'
import { ADMIN_USERS_KEY } from '../utils/admin-user'
import { useUserActions } from '../composables/useUserActions'

defineOptions({ name: 'UsersAdminPage' })

const t = useModuleT('users')
const format = useFormat()
const actions = useUserActions()

const search = ref('')
// Debounced so the API is not hit on every keystroke.
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    q.value = value.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))
const verified = ref<'all' | 'true' | 'false'>('all')
// `all` stands for no role filter (a select cannot hold an empty value).
const role = ref('all')
const page = ref(1)
const pageSize = ref(20)
const sorting = ref<{ id: string, desc: boolean }[]>([{ id: 'createdAt', desc: true }])

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  q: q.value || undefined,
  verified: verified.value === 'all' ? undefined : verified.value,
  role: role.value === 'all' ? undefined : role.value,
  sort: sorting.value[0]?.id,
  order: sorting.value[0] ? (sorting.value[0].desc ? 'desc' : 'asc') : undefined,
}))

const { data, status } = await useFetch<UsersPage>('/api/admin/users', {
  key: ADMIN_USERS_KEY,
  query,
  default: () => ({ items: [], total: 0, page: 1, pageSize: 20, hasRoles: false, hasSubscriptions: false, roles: [] }),
})
const hasRoles = computed(() => data.value.hasRoles)
const hasSubscriptions = computed(() => data.value.hasSubscriptions)
const roleLabel = (value: string) => t(`admin.roleNames.${value}`, value.charAt(0).toUpperCase() + value.slice(1))
const roleItems = computed(() => data.value.roles.map(value => ({ label: roleLabel(value), value })))
const roleFilterItems = computed(() => [{ label: t('admin.filters.allRoles', 'All roles'), value: 'all' }, ...roleItems.value])
const loading = computed(() => status.value === 'pending')

// Any change to the filters or sorting starts over on page 1.
watch([q, verified, role, pageSize, sorting], () => {
  page.value = 1
})

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const RowMenu = resolveComponent('RowMenu')

const sortable = (accessorKey: string, label: string) => ({
  accessorKey,
  header: () => h(UButton, {
    color: 'neutral',
    variant: 'ghost',
    label,
    class: '-mx-2.5',
    icon: sorting.value[0]?.id === accessorKey
      ? (sorting.value[0].desc ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up')
      : 'i-lucide-arrow-up-down',
    onClick: () => {
      const current = sorting.value[0]
      sorting.value = [{ id: accessorKey, desc: current?.id === accessorKey ? !current.desc : false }]
    },
  }),
})

const dateCell = (value?: string | null) => format.dateTime(value) || '–'

const columns = computed<TableColumn<UserRow>[]>(() => [
  sortable('id', 'ID'),
  sortable('name', t('admin.name', 'Name')),
  sortable('email', t('admin.email', 'Email')),
  ...(hasRoles.value ? [{ ...sortable('role', t('admin.role', 'Role')), cell: ({ row }: { row: { original: UserRow } }) => row.original.role ? roleLabel(row.original.role) : '–' }] : []),
  ...(hasSubscriptions.value
    ? [{
        id: 'subscription',
        header: t('admin.subscription', 'Subscription'),
        cell: ({ row }: { row: { original: UserRow } }) => {
          const subscription = row.original.subscription
          return subscription
            ? h(UBadge, { variant: 'subtle', color: statusColor(subscription.status), label: subscription.planKey ?? subscription.status })
            : '–'
        },
      }]
    : []),
  {
    id: 'verified',
    header: t('admin.verified', 'Verified'),
    cell: ({ row }) => h(UBadge, {
      variant: 'subtle',
      color: row.original.emailVerifiedAt ? 'success' : 'neutral',
      label: row.original.emailVerifiedAt ? t('admin.filters.verified', 'Verified') : t('admin.filters.unverified', 'Unverified'),
    }),
  },
  { ...sortable('lastLoginAt', t('admin.lastLogin', 'Last sign-in')), cell: ({ row }: { row: { original: UserRow } }) => dateCell(row.original.lastLoginAt) },
  { ...sortable('createdAt', t('admin.created', 'Created')), cell: ({ row }: { row: { original: UserRow } }) => dateCell(row.original.createdAt) },
  {
    id: 'actions',
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original), subject: row.original.name }),
  },
])

const verifiedOptions = computed(() => [
  { label: t('admin.filters.all', 'All'), value: 'all' },
  { label: t('admin.filters.verified', 'Verified'), value: 'true' },
  { label: t('admin.filters.unverified', 'Unverified'), value: 'false' },
])
const pageSizes = [10, 20, 50, 100]
const filtersActive = computed(() => !!(search.value || role.value !== 'all' || verified.value !== 'all'))
function resetFilters() {
  search.value = ''
  role.value = 'all'
  verified.value = 'all'
}

function openUser(_event: Event, row: { original: UserRow }) {
  return navigateTo(actions.userPath(row.original.id))
}

async function addUser() {
  const created = await actions.create({ roles: hasRoles.value ? data.value.roles : [] })
  if (created) await navigateTo(actions.userPath(created.id))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading :title="t('admin.title', 'Users')">
      <template #actions>
        <UButton
          icon="i-lucide-user-plus"
          :label="t('admin.create', 'Add user')"
          @click="addUser"
        />
      </template>
    </PageHeading>

    <PageToolbar>
      <UInput
        v-model="search"
        class="w-full max-w-sm"
        icon="i-lucide-search"
        :loading="loading"
        :placeholder="t('admin.search', 'Search name, email or role...')"
      />
      <USelect
        v-model="verified"
        :items="verifiedOptions"
        class="w-40"
      />
      <USelect
        v-if="hasRoles"
        v-model="role"
        :items="roleFilterItems"
        class="w-48"
        icon="i-lucide-shield"
      />
      <UButton
        v-if="filtersActive"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        :label="t('admin.filters.clear', 'Clear filters')"
        @click="resetFilters"
      />
    </PageToolbar>

    <TableCard>
      <UTable
        :data="data.items"
        :columns="columns"
        :loading="loading"
        :ui="tableUi()"
        @select="openUser"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-users"
            variant="naked"
            :title="t('admin.empty', 'No users match')"
            :actions="[filtersActive
              ? { label: t('admin.filters.clear', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: resetFilters }
              : { label: t('admin.create', 'Add user'), icon: 'i-lucide-user-plus', onClick: addUser }]"
          />
        </template>
      </UTable>
      <template #footer>
        <div class="flex items-center gap-3">
          <span>{{ t('admin.total', '{count} users', { count: data.total }) }}</span>
          <USelect
            v-model="pageSize"
            :items="pageSizes"
            size="sm"
            class="w-20"
          />
        </div>
        <UPagination
          v-model:page="page"
          :items-per-page="pageSize"
          :total="data.total"
        />
      </template>
    </TableCard>
  </div>
</template>
