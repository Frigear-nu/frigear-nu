<script setup lang="ts">
defineOptions({ name: 'AdminThingsPage' })

// Renders the shared page components, so the layout and the patterns are exercised together.
const rows = [{ name: 'alias-table-row' }]
const columns = [{ accessorKey: 'name', header: 'Name' }]
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>things-page</div>
    <PageHeading
      title="alias-heading"
      description="alias-description"
      :breadcrumb="[{ label: 'alias-back', to: '/admin' }, { label: 'alias-heading' }]"
    >
      <template #actions>
        <span>alias-links</span>
      </template>
    </PageHeading>
    <PageToolbar>
      <span>alias-toolbar</span>
    </PageToolbar>
    <SectionCard title="alias-section">
      <TableCard>
        <UTable
          :data="rows"
          :columns="columns"
          :ui="tableUi()"
        />
      </TableCard>
    </SectionCard>
    <SectionCard title="alias-key-values">
      <DescriptionList :items="[{ key: 'plan', label: 'Plan', value: 'alias-plan' }, { key: 'seats', label: 'Seats', value: null }]">
        <template #plan="{ item }">
          <strong>{{ item.value }}-slot</strong>
        </template>
      </DescriptionList>
    </SectionCard>
    <StatCard
      label="alias-stat"
      icon="i-lucide-users"
    >
      alias-stat-value
    </StatCard>
    <ListCard
      title="alias-list"
      to="/admin"
    >
      <li>alias-list-row</li>
    </ListCard>
    <UEmpty
      variant="naked"
      title="alias-empty"
    />
  </div>
</template>
