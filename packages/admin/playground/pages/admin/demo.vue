<script setup lang="ts">
const rows = [
  { name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { name: 'Grace Hopper', email: 'grace@example.com', role: 'editor' },
  { name: 'Linus T', email: 'linus@example.com', role: 'member' },
]
const columns = [{ accessorKey: 'name', header: 'Name' }, { accessorKey: 'email', header: 'Email' }, { accessorKey: 'role', header: 'Role' }]
</script>

<template>
  <AdminPage>
    <AdminPageHeader title="Users" description="Everyone with access to this site.">
      <template #links>
        <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Export" />
        <UButton icon="i-lucide-plus" label="New user" />
      </template>
    </AdminPageHeader>
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <AdminStatCard label="Users">1 204</AdminStatCard>
      <AdminStatCard label="Active">87 %</AdminStatCard>
      <AdminStatCard label="Pending" empty="Nothing pending" />
      <AdminStatCard label="Loading" loading />
    </div>
    <div class="grid gap-4 lg:grid-cols-3">
      <AdminSection title="Members" description="Latest sign-ups" class="lg:col-span-2">
        <template #flush><AdminTable :data="rows" :columns="columns" /></template>
      </AdminSection>
      <AdminSection title="Details">
        <AdminKeyValue :items="[{ key: 'a', label: 'Plan', value: 'Pro' }, { key: 'b', label: 'Seats', value: 12 }]" />
      </AdminSection>
    </div>
  </AdminPage>
</template>
