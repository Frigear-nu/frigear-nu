<script setup lang="ts">
const tags = ref<string[]>(['example', 'tag'])
const url = ref('')
const toggle = ref(false)
const interval = ref(3600)
const tab = ref('details')
const format = useFormat()
const rows: { name: string, email: string, tickets: number, note?: string }[] = [
  { name: 'Ada Lovelace', email: 'ada@example.com', tickets: 2, note: 'Vegetarian' },
  { name: 'Grace Hopper', email: 'grace@example.com', tickets: 12 },
]
const { sorting, header } = useTableSort({ id: 'name', desc: false })
const TableIdentity = resolveComponent('TableIdentity')
const columns = [
  {
    accessorKey: 'name',
    header: header('name', 'Name'),
    cell: ({ row }: { row: { original: typeof rows[number] } }) => h(TableIdentity, { title: row.original.name, description: row.original.email, avatar: { alt: row.original.name } }),
  },
  { accessorKey: 'tickets', header: header('tickets', 'Tickets'), meta: numericColumn },
  { accessorKey: 'note', header: 'Note', cell: ({ row }: { row: { original: typeof rows[number] } }) => row.original.note ?? emptyCell() },
]
const page = ref(1)
const pageSize = ref(20)
const refreshing = ref(false)
const menu = [[{ label: 'Open', icon: 'i-lucide-arrow-right' }, { label: 'Edit', icon: 'i-lucide-pencil' }], [{ label: 'Delete event', icon: 'i-lucide-trash-2', color: 'error' as const }]]
</script>

<template>
  <UContainer class="py-10 flex flex-col gap-6">
    <h1 class="text-2xl font-bold">
      @frigear-nu/ui playground
    </h1>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        Toggle
      </h2>
      <SwitchToggle v-model="toggle" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        TagInput
      </h2>
      <TagInput v-model="tags" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        UrlInput
      </h2>
      <UrlInput v-model="url" />
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">
        IntervalInput
      </h2>
      <IntervalInput v-model="interval" />
    </div>

    <div class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">
        Page patterns
      </h2>
      <PageHeading
        title="Spring meetup"
        description="A sample detail page heading."
        :breadcrumb="[{ label: 'Events', to: '/' }, { label: 'Spring meetup' }]"
      >
        <template #badge>
          <StatusBadge
            status="published"
            label="Published"
          />
        </template>
        <span>{{ format.date(new Date()) }}</span>
        <template #actions>
          <UButton
            color="neutral"
            variant="outline"
            label="View public page"
          />
          <RowMenu
            :items="menu"
            subject="Spring meetup"
            variant="outline"
          />
        </template>
      </PageHeading>
      <PageTabs
        v-model="tab"
        :items="[{ label: 'Details', value: 'details', icon: 'i-lucide-info' }, { label: 'Tickets', value: 'tickets', icon: 'i-lucide-ticket' }]"
      />
      <div class="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Attendees"
          icon="i-lucide-users"
          :value="42"
          hint="8 checked in"
          to="/"
        />
        <StatCard
          label="Revenue"
          :value="format.money(1250000, 'DKK')"
        />
        <StatCard
          label="Pending"
          empty="Nothing pending"
        />
      </div>
      <SectionCard
        title="Key facts"
        description="What attendees see."
      >
        <DescriptionList :items="[{ label: 'Venue', value: 'Copenhagen' }, { label: 'Capacity', value: null }]" />
      </SectionCard>
      <USwitch
        v-model="refreshing"
        label="Refreshing"
      />
      <TableCard :refreshing="refreshing">
        <UTable
          v-model:sorting="sorting"
          :data="rows"
          :columns="columns"
          :ui="tableUi()"
        />
        <template #footer>
          <TablePagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :total="132"
          />
        </template>
      </TableCard>
      <div class="flex flex-wrap items-center gap-2">
        <StatusBadge status="published" />
        <StatusBadge
          status="pending"
          label="Awaiting review"
        />
        <StatusBadge status="failed" />
        <StatusBadge status="draft" />
        <StatusBadge
          status="archived"
          :colors="{ archived: 'warning' }"
        />
      </div>
      <TableCard
        title="Attendees"
        description="Everyone registered for this event."
      >
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            label="Add attendee"
          />
        </template>
        <UTable
          :data="rows"
          :columns="columns"
          :ui="tableUi()"
        />
      </TableCard>
      <ListCard
        title="Recent sign-ups"
        to="/"
      >
        <li
          v-for="row in rows"
          :key="row.name"
        >
          {{ row.name }}
        </li>
      </ListCard>
    </div>
  </UContainer>
</template>
