<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AuthorizationRolePermissionDto } from '../../utils/api'
import { useRoleLabels } from './useRoleLabels'
import { computed, h, resolveComponent, tableUi } from '#imports'

defineOptions({ name: 'AuthorizationRolePermissions' })

// The permissions of one role: those it holds, with why, then the rest dimmed.
const props = defineProps<{
  permissions: AuthorizationRolePermissionDto[]
  /** Turns a role name into its label (for "Inherited from Editor"). */
  roleLabel?: (name: string) => string
}>()

const { t, translated, grantLabel, grantColors, provenanceLabel, provenanceColors } = useRoleLabels()

const held = computed(() => props.permissions.filter(permission => permission.grant))
const notHeld = computed(() => props.permissions.filter(permission => !permission.grant))

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const UBadge = resolveComponent('UBadge')

type Cell = { row: { original: AuthorizationRolePermissionDto } }

const nameColumn: TableColumn<AuthorizationRolePermissionDto> = {
  accessorKey: 'name',
  header: t('admin.permission', 'Permission'),
  cell: ({ row }: Cell) => h(TableIdentity, {
    title: translated(row.original.labelKey, row.original.label ?? row.original.name),
    description: row.original.label ? row.original.name : translated(row.original.descriptionKey, row.original.description ?? ''),
  }, {
    badges: () => [
      row.original.sensitive ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm', label: t('admin.sensitive', 'Sensitive') }) : null,
      row.original.sessionOnly ? h(UBadge, { color: 'neutral', variant: 'outline', size: 'sm', label: t('admin.sessionOnly', 'Session only') }) : null,
    ],
  }),
}

const heldColumns = computed<TableColumn<AuthorizationRolePermissionDto>[]>(() => [
  nameColumn,
  {
    id: 'grant',
    header: t('admin.grantedBy', 'Granted by'),
    meta: { class: { th: 'w-0', td: 'w-0 whitespace-nowrap' } },
    // Auth's provenance when it has one (host config, a module, a module's default grant, an inherited role), else
    // how the grant reads (granted, inherited, every signed-in user).
    cell: ({ row }: Cell) => row.original.sources.length
      ? h('div', { class: 'flex flex-wrap gap-1' }, row.original.sources.map(source =>
          h(StatusBadge, { status: source.via, colors: provenanceColors, label: provenanceLabel(source, props.roleLabel) })))
      : row.original.grant
        ? h(StatusBadge, { status: row.original.grant.via, colors: grantColors, label: grantLabel(row.original.grant, props.roleLabel) })
        : null,
  },
])
const notHeldColumns = computed<TableColumn<AuthorizationRolePermissionDto>[]>(() => [nameColumn])
</script>

<template>
  <div class="flex flex-col gap-4">
    <TableCard :title="t('admin.held', 'Held permissions ({count})', { count: held.length })">
      <UTable
        :data="held"
        :columns="heldColumns"
        :ui="tableUi({ tr: '' })"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-shield-off"
            variant="naked"
            :title="t('admin.noneHeld', 'This role holds no permissions')"
          />
        </template>
      </UTable>
    </TableCard>
    <TableCard
      v-if="notHeld.length"
      :title="t('admin.notHeldTitle', 'Not held ({count})', { count: notHeld.length })"
    >
      <UTable
        :data="notHeld"
        :columns="notHeldColumns"
        :ui="tableUi({ tr: 'opacity-60' })"
      />
    </TableCard>
  </div>
</template>
