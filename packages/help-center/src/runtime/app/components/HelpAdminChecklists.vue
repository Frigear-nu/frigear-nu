<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffHelpChecklist } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { computed, emptyCell, h, navigateTo, resolveComponent, tableUi, useFetch, useHelpCenterPaths, useHelpCenterTranslate, useHelpChecklistActions, useModuleT } from '#imports'

defineOptions({ name: 'HelpAdminChecklists' })

// The checklists tab of the admin page: the onboarding lists, with how many articles each has. A row opens the
// checklist's page (its articles and who has read them).
const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const paths = useHelpCenterPaths()
const actions = useHelpChecklistActions()

const { data, status, refresh } = await useFetch<StaffHelpChecklist[]>(helpCenterApi.admin.checklists, { key: 'help-center:admin:checklists', default: () => [] })
const loading = computed(() => status.value === 'pending' && !data.value?.length)

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')

const grantsLabel = (checklist: StaffHelpChecklist) => checklist.grants.length
  ? t('admin.grantsRestricted', 'Restricted')
  : t('admin.grantsNobody', 'Nobody yet')

const columns = computed<TableColumn<StaffHelpChecklist>[]>(() => [
  {
    id: 'name',
    header: t('admin.checklistName', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: row.original.operationId ? t('admin.operationOf', 'Operation {id}', { id: row.original.operationId }) : t('admin.everyone', 'Everyone') }),
  },
  {
    id: 'items',
    header: t('admin.checklistArticles', 'Articles'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, t('admin.itemCounts', '{required} required of {total}', { required: row.original.items.filter(item => item.required).length, total: row.original.items.length })),
  },
  {
    id: 'grants',
    header: t('admin.grantsLabel', 'Who can see it'),
    cell: ({ row }) => row.original.operationId || row.original.grants.length ? h('span', { class: 'text-muted' }, grantsLabel(row.original)) : emptyCell(),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onChanged: refresh }), subject: tr(row.original.name) }),
  },
])

function open(checklist: StaffHelpChecklist) {
  const to = paths.adminChecklist(checklist.id)
  if (to) return navigateTo(to)
}
</script>

<template>
  <TableCard
    :title="t('admin.checklists', 'Onboarding checklists')"
    :loading="loading"
  >
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        :label="t('admin.createChecklist', 'Add checklist')"
        @click="actions.create()"
      />
    </template>
    <UTable
      :data="data ?? []"
      :columns="columns"
      :ui="tableUi()"
      data-test="help-admin-checklists"
      @select="(_: Event, row: { original: StaffHelpChecklist }) => open(row.original)"
    >
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-list-checks"
          :title="t('admin.checklistsEmpty', 'No checklists yet')"
          :description="t('admin.checklistsEmptyDescription', 'A checklist is a list of articles people have to read. You see who has finished it.')"
          :actions="[{ label: t('admin.createChecklist', 'Add checklist'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
