<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { authorizationApi } from '../../utils/api'
import type { AuthorizationPermissionMatrixDto, AuthorizationRoleSummaryDto } from '../../utils/api'
import { useQueryTab, useRbacLabels } from '../admin/useRbacLabels'
import { computed, emptyCell, errorMessage, h, navigateTo, numericColumn, resolveComponent, tableUi, useFetch } from '#imports'

defineOptions({ name: 'AuthorizationAdminRolesPage' })

const { t, rolePath, sourceLabel, sourceColors, grantLabel } = useRbacLabels()
const tab = useQueryTab(['roles', 'matrix'] as const)

const [{ data: roles, error, refresh }, { data: matrix }] = await Promise.all([
  useFetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, { key: 'authorization-admin-roles' }),
  useFetch<AuthorizationPermissionMatrixDto>(authorizationApi.admin.permissions, { key: 'authorization-admin-permissions' }),
])
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
const labelOf = (name: string) => roles.value?.find(role => role.name === name)?.label ?? matrix.value?.roles.find(role => role.name === name)?.label ?? name

const tabs = computed(() => [
  { value: 'roles', label: t('admin.tabs.roles', 'Roles'), icon: 'i-lucide-users-round' },
  { value: 'matrix', label: t('admin.tabs.matrix', 'Permission matrix'), icon: 'i-lucide-grid-3x3' },
])

const StatusBadge = resolveComponent('StatusBadge')
const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')
const UTooltip = resolveComponent('UTooltip')
const UIcon = resolveComponent('UIcon')
const UBadge = resolveComponent('UBadge')

type RoleCell = { row: { original: AuthorizationRoleSummaryDto } }

const roleColumns = computed<TableColumn<AuthorizationRoleSummaryDto>[]>(() => [
  {
    accessorKey: 'label',
    header: t('admin.role', 'Role'),
    cell: ({ row }: RoleCell) => h(TableIdentity, { title: row.original.label, description: row.original.description ?? row.original.name }, {
      badges: () => row.original.isDefault ? h(UBadge, { color: 'neutral', variant: 'outline', size: 'sm', label: t('admin.default', 'Default') }) : null,
    }),
  },
  {
    accessorKey: 'source',
    header: t('admin.sourceHeader', 'Source'),
    cell: ({ row }: RoleCell) => h(StatusBadge, { status: row.original.source, colors: sourceColors, label: sourceLabel(row.original.source) }),
  },
  {
    accessorKey: 'inherits',
    header: t('admin.inherits', 'Inherits'),
    cell: ({ row }: RoleCell) => row.original.inherits.length ? row.original.inherits.map(labelOf).join(', ') : emptyCell(),
  },
  { accessorKey: 'userCount', header: t('admin.users', 'Users'), meta: numericColumn },
  { accessorKey: 'permissionCount', header: t('admin.permissions', 'Permissions'), meta: numericColumn },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }: RoleCell) => h(RowMenu, {
      items: [{ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: rolePath(row.original.name) }],
      subject: row.original.label,
    }),
  },
])

function openRole(_event: Event, row: { original: AuthorizationRoleSummaryDto }) {
  return navigateTo(rolePath(row.original.name))
}

// The matrix: one table per resource (`events:*`, `users:*`), one column per role, most senior first.
type MatrixRow = AuthorizationPermissionMatrixDto['permissions'][number]
const groups = computed(() => {
  const byResource = new Map<string, MatrixRow[]>()
  for (const permission of matrix.value?.permissions ?? []) {
    const list = byResource.get(permission.resource) ?? []
    list.push(permission)
    byResource.set(permission.resource, list)
  }
  return [...byResource].map(([resource, rows]) => ({ resource, rows }))
})

const matrixColumns = computed<TableColumn<MatrixRow>[]>(() => [
  {
    accessorKey: 'name',
    header: t('admin.permission', 'Permission'),
    cell: ({ row }) => h(TableIdentity, { title: row.original.name, description: row.original.description }, {
      badges: () => row.original.pii ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm', label: t('admin.pii', 'Personal data') }) : null,
    }),
  },
  ...(matrix.value?.roles ?? []).map(role => ({
    id: `role-${role.name}`,
    header: role.label,
    meta: { class: { th: 'w-0 text-center', td: 'w-0 text-center' } },
    cell: ({ row }: { row: { original: MatrixRow } }) => {
      const grant = row.original.holders[role.name]
      if (!grant) return h('span', { 'class': 'text-dimmed', 'aria-label': t('admin.notHeld', 'Not held') }, '–')
      const label = grantLabel(grant, labelOf)
      return h(UTooltip, { text: label }, () => h(UIcon, {
        'name': 'i-lucide-check',
        'class': ['size-4', grant.via === 'inherited' ? 'text-muted' : 'text-primary'],
        'aria-label': label,
      }))
    },
  })),
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Roles & permissions')"
      :description="t('admin.description', 'What each role may do. Senior roles hold everything their juniors hold.')"
    />

    <UEmpty
      v-if="error || !roles"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to roles') : t('admin.loadFailed', 'Roles could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageTabs
        v-model="tab"
        :items="tabs"
      />

      <TableCard v-if="tab === 'roles'">
        <UTable
          :data="roles"
          :columns="roleColumns"
          :ui="tableUi()"
          @select="openRole"
        />
      </TableCard>

      <template v-else>
        <UEmpty
          v-if="!groups.length"
          icon="i-lucide-shield"
          :title="t('admin.noPermissions', 'No permissions are registered')"
          :description="t('admin.noPermissionsHint', 'Modules register permissions as they are installed.')"
        />
        <TableCard
          v-for="group in groups"
          :key="group.resource"
          :title="group.resource"
        >
          <UTable
            :data="group.rows"
            :columns="matrixColumns"
            :ui="tableUi({ tr: '' })"
          />
        </TableCard>
      </template>
    </template>
  </div>
</template>
