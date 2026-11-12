<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AuthorizationRolePermissionDto } from '../../utils/api'
import { useRbacLabels } from './useRbacLabels'
import { computed, h, resolveComponent, tableUi } from '#imports'

defineOptions({ name: 'AuthorizationRolePermissions' })

// The permissions of one role: those it holds, with why, then the rest dimmed. Used by the role page and the user tab.
const props = defineProps<{
  permissions: AuthorizationRolePermissionDto[]
  /** Turns a role name into its label (for "Inherited from Editor"). */
  roleLabel?: (name: string) => string
  /** Hides the not-held table (the user tab only lists what the user may do). */
  heldOnly?: boolean
}>()

const { t, grantLabel, grantColors } = useRbacLabels()

const held = computed(() => props.permissions.filter(permission => permission.grant))
const notHeld = computed(() => props.permissions.filter(permission => !permission.grant && !permission.wildcard))

const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const UBadge = resolveComponent('UBadge')

type Cell = { row: { original: AuthorizationRolePermissionDto } }

const nameColumn: TableColumn<AuthorizationRolePermissionDto> = {
  accessorKey: 'name',
  header: t('admin.permission', 'Permission'),
  cell: ({ row }: Cell) => h(TableIdentity, {
    title: row.original.name,
    description: row.original.description ?? (row.original.name === '*'
      ? t('admin.wildcardAll', 'Every permission except personal data')
      : row.original.wildcard ? t('admin.wildcardResource', 'Every {resource} permission except personal data', { resource: row.original.resource }) : null),
  }, {
    badges: () => row.original.pii ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm', label: t('admin.pii', 'Personal data') }) : null,
  }),
}

const heldColumns = computed<TableColumn<AuthorizationRolePermissionDto>[]>(() => [
  nameColumn,
  {
    id: 'grant',
    header: t('admin.why', 'Why'),
    meta: { class: { th: 'w-0', td: 'w-0 whitespace-nowrap' } },
    cell: ({ row }: Cell) => row.original.grant
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
      v-if="!heldOnly && notHeld.length"
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
