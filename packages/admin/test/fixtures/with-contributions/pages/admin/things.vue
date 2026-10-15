<script setup lang="ts">
defineOptions({ name: 'AdminThingsPage' })

// Renders every deprecated `Admin*` alias, so they keep working until all modules use the ui components.
const rows = [{ name: 'alias-table-row' }]
const columns = [{ accessorKey: 'name', header: 'Name' }]
</script>

<template>
  <AdminPage>
    <div>things-page</div>
    <AdminPageHeader
      title="alias-heading"
      description="alias-description"
      :back="{ label: 'alias-back', to: '/admin' }"
    >
      <template #links>
        <span>alias-links</span>
      </template>
    </AdminPageHeader>
    <AdminToolbar>
      <span>alias-toolbar</span>
    </AdminToolbar>
    <AdminSection title="alias-section">
      <template #flush>
        <AdminTable
          :data="rows"
          :columns="columns"
        />
      </template>
    </AdminSection>
    <AdminSection title="alias-key-values">
      <AdminKeyValue :items="[{ key: 'plan', label: 'Plan', value: 'alias-plan' }, { key: 'seats', label: 'Seats', value: null }]">
        <template #plan="{ item }">
          <strong>{{ item.value }}-slot</strong>
        </template>
      </AdminKeyValue>
    </AdminSection>
    <AdminStatCard
      label="alias-stat"
      icon="i-lucide-users"
    >
      alias-stat-value
    </AdminStatCard>
    <AdminListCard
      title="alias-list"
      to="/admin"
    >
      <li>alias-list-row</li>
    </AdminListCard>
    <AdminEmpty title="alias-empty" />
  </AdminPage>
</template>
