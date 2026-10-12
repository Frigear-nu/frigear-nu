<script setup lang="ts">
defineOptions({ name: 'UsersAdminPage' })

type AdminUser = { id: number, name: string, email: string, role?: string, emailVerifiedAt: string | null, lastLoginAt?: string | null, createdAt: string, subscription?: { planKey: string | null, status: string } | null }
type AdminUsersPage = { items: AdminUser[], total: number, page: number, pageSize: number, hasRoles: boolean, hasSubscriptions: boolean, roles: string[] }

const t = useModuleT('users')
const toast = useToast()
const route = useRoute()
// Detail pages live under the current path, which keeps any locale prefix.
const userPath = (id: number) => `${route.path.replace(/\/+$/, '')}/${id}`

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

const { data, status } = await useFetch<AdminUsersPage>('/api/admin/users', {
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

const dateFormat = (value?: string | null) => value ? new Date(value).toLocaleString() : '–'
const sortable = (accessorKey: string, label: string) => ({
  accessorKey,
  header: () => h(resolveComponent('UButton'), {
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

const columns = computed(() => [
  sortable('id', 'ID'),
  sortable('name', t('admin.name', 'Name')),
  sortable('email', t('admin.email', 'Email')),
  ...(hasRoles.value ? [{ ...sortable('role', t('admin.role', 'Role')), cell: ({ row }: { row: { original: AdminUser } }) => row.original.role ? roleLabel(row.original.role) : '–' }] : []),
  ...(hasSubscriptions.value
    ? [{
        id: 'subscription',
        header: t('admin.subscription', 'Subscription'),
        cell: ({ row }: { row: { original: AdminUser } }) => {
          const subscription = row.original.subscription
          return subscription
            ? h(resolveComponent('UBadge'), {
                variant: 'subtle',
                color: ['active', 'trialing'].includes(subscription.status) ? 'success' : 'neutral',
                label: subscription.planKey ?? subscription.status,
              })
            : '–'
        },
      }]
    : []),
  { id: 'verified', header: t('admin.verified', 'Verified'), cell: ({ row }: { row: { original: AdminUser } }) => row.original.emailVerifiedAt ? '✓' : '–' },
  { ...sortable('lastLoginAt', t('admin.lastLogin', 'Last sign-in')), cell: ({ row }: { row: { original: AdminUser } }) => dateFormat(row.original.lastLoginAt) },
  { ...sortable('createdAt', t('admin.created', 'Created')), cell: ({ row }: { row: { original: AdminUser } }) => dateFormat(row.original.createdAt) },
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

// The modal creates users; existing ones are edited on their own page.
const open = ref(false)
const form = reactive({ name: '', email: '', role: '', emailVerified: false, sendWelcomeEmail: true })
const saving = ref(false)

function startCreate() {
  Object.assign(form, { name: '', email: '', role: '', emailVerified: false, sendWelcomeEmail: true })
  open.value = true
}

function openUser(_event: Event, row: { original: AdminUser }) {
  return navigateTo(userPath(row.original.id))
}

async function save() {
  saving.value = true
  try {
    const created = await $fetch<{ id: number }>('/api/admin/users', {
      method: 'POST',
      body: { ...form, role: hasRoles.value && form.role ? form.role : undefined },
    })
    open.value = false
    toast.add({ title: t('admin.created_ok', 'User created.'), color: 'success' })
    await navigateTo(userPath(created.id))
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        {{ t('admin.title', 'Users') }}
      </h1>
      <UButton
        icon="i-lucide-user-plus"
        :label="t('admin.create', 'Create user')"
        @click="startCreate"
      />
    </div>
    <div class="mb-4 flex flex-wrap items-center gap-3">
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
    </div>
    <UTable
      :data="data.items"
      :columns="columns"
      :loading="loading"
      class="rounded-lg border border-default"
      @select="openUser"
    >
      <template #empty>
        {{ t('admin.empty', 'No users match.') }}
      </template>
    </UTable>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3 text-sm text-muted">
        <span>{{ t('admin.total', '{count} users', { count: data.total }) }}</span>
        <USelect
          v-model="pageSize"
          :items="pageSizes"
          class="w-20"
        />
      </div>
      <UPagination
        v-model:page="page"
        :items-per-page="pageSize"
        :total="data.total"
      />
    </div>
    <UModal
      v-model:open="open"
      :title="t('admin.create', 'Create user')"
    >
      <template #body>
        <form
          class="flex flex-col gap-4"
          @submit.prevent="save"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <UInput
              v-model="form.name"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField :label="t('admin.email', 'Email')">
            <UInput
              v-model="form.email"
              type="email"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField
            v-if="hasRoles"
            :label="t('admin.role', 'Role')"
          >
            <USelect
              v-model="form.role"
              :items="roleItems"
              class="w-full"
              :placeholder="t('admin.rolePlaceholder', 'Select a role')"
            />
          </UFormField>
          <UCheckbox
            v-model="form.emailVerified"
            :label="t('admin.emailVerified', 'Mark the email address as verified')"
          />
          <UCheckbox
            v-model="form.sendWelcomeEmail"
            :label="t('admin.sendWelcome', 'Email a sign-in link')"
          />
          <div class="flex justify-end gap-2">
            <UButton
              variant="subtle"
              :label="t('admin.cancel', 'Cancel')"
              @click="open = false"
            />
            <UButton
              type="submit"
              :loading="saving"
              :label="t('admin.save', 'Save')"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
