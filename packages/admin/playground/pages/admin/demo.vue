<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

type Row = { name: string, email: string, role: string }

const rows: Row[] = [
  { name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { name: 'Grace Hopper', email: 'grace@example.com', role: 'editor' },
  { name: 'Linus T', email: 'linus@example.com', role: 'member' },
]
const search = ref('')
const tab = ref('members')
const filtered = computed(() => rows.filter(row => `${row.name} ${row.email}`.toLowerCase().includes(search.value.toLowerCase())))

const menu = (row: Row): DropdownMenuItem[][] => [
  [
    { label: 'Open', icon: 'i-lucide-arrow-right' },
    { label: 'Resend sign-in link', icon: 'i-lucide-mail' },
  ],
  [{ label: `Delete ${row.name}`, icon: 'i-lucide-trash-2', color: 'error' }],
]

const UBadge = resolveComponent('UBadge')
const RowMenu = resolveComponent('RowMenu')
const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role', cell: ({ row }) => h(UBadge, { label: row.original.role, variant: 'subtle', color: statusColor(row.original.role, { admin: 'primary' }) }) },
  { id: 'actions', cell: ({ row }) => h(RowMenu, { items: menu(row.original), subject: row.original.name }) },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      title="Users"
      description="Everyone with access to this site."
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          label="Export users"
        />
        <UButton
          icon="i-lucide-plus"
          label="Add user"
        />
      </template>
    </PageHeading>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Users"
        icon="i-lucide-users"
        value="1 204"
        hint="24 new this month"
        to="/admin"
      />
      <StatCard
        label="Active"
        value="87 %"
      />
      <StatCard
        label="Pending"
        empty="Nothing pending"
      />
      <StatCard
        label="Loading"
        loading
      />
    </div>

    <PageTabs
      v-model="tab"
      :items="[{ label: 'Members', value: 'members', icon: 'i-lucide-users' }, { label: 'Details', value: 'details', icon: 'i-lucide-info' }]"
    />

    <template v-if="tab === 'members'">
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search users"
        />
        <template #right>
          <span class="text-muted text-sm">{{ filtered.length }} users</span>
        </template>
      </PageToolbar>

      <TableCard>
        <UTable
          :data="filtered"
          :columns="columns"
          :ui="tableUi()"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-users"
              title="No users match"
              variant="naked"
            />
          </template>
        </UTable>
        <template #footer>
          <span>{{ filtered.length }} of {{ rows.length }}</span>
        </template>
      </TableCard>
    </template>

    <div
      v-else
      class="grid gap-4 lg:grid-cols-3"
    >
      <SectionCard
        title="Members"
        description="Latest sign-ups"
        class="lg:col-span-2"
        flush
      >
        <ul class="divide-default divide-y text-sm">
          <li
            v-for="row in rows"
            :key="row.email"
            class="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <span>{{ row.name }}</span>
            <RowMenu
              :items="menu(row)"
              :subject="row.name"
            />
          </li>
        </ul>
      </SectionCard>
      <SectionCard title="Details">
        <DescriptionList :items="[{ label: 'Plan', value: 'Pro' }, { label: 'Seats', value: 12 }, { label: 'Billing email', value: null }]" />
      </SectionCard>
    </div>
  </div>
</template>
