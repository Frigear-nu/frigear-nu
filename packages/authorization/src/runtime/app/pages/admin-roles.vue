<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { authorizationApi } from '../../utils/api'
import type { AuthorizationRoleSummaryDto } from '../../utils/api'
import { useRoleLabels } from '../admin/useRoleLabels'
import { computed, emptyCell, errorMessage, h, navigateTo, numericColumn, resolveComponent, tableUi, useFetch } from '#imports'

defineOptions({ name: 'AuthorizationAdminRolesPage' })

// The roles admin: every configured role, read-only (roles come from `authorization.roles` and modules). Users get
// roles on their own page (the "Roles and permissions" tab).
const { t, rolePath, roleLabel, kindOf, kindLabel, kindColors } = useRoleLabels()

const { data: roles, error, refresh } = await useFetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, { key: 'authorization-admin-roles' })
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
const labelOf = (name: string) => {
  const role = roles.value?.find(candidate => candidate.name === name)
  return role ? roleLabel(role) : name
}

const StatusBadge = resolveComponent('StatusBadge')
const TableIdentity = resolveComponent('TableIdentity')
const RowMenu = resolveComponent('RowMenu')

type RoleCell = { row: { original: AuthorizationRoleSummaryDto } }

const columns = computed<TableColumn<AuthorizationRoleSummaryDto>[]>(() => [
  {
    accessorKey: 'label',
    header: t('admin.role', 'Role'),
    cell: ({ row }: RoleCell) => h(TableIdentity, { title: roleLabel(row.original), description: row.original.description ?? row.original.name }),
  },
  {
    id: 'kind',
    header: t('admin.kindHeader', 'Held by'),
    cell: ({ row }: RoleCell) => {
      const kind = kindOf(row.original)
      return h(StatusBadge, { status: kind, colors: kindColors, label: kindLabel(kind) })
    },
  },
  {
    accessorKey: 'inherit',
    header: t('admin.inherits', 'Inherits'),
    cell: ({ row }: RoleCell) => row.original.inherit.length ? row.original.inherit.map(labelOf).join(', ') : emptyCell(),
  },
  { accessorKey: 'userCount', header: t('admin.users', 'Users'), meta: numericColumn },
  { accessorKey: 'permissionCount', header: t('admin.permissions', 'Permissions'), meta: numericColumn },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }: RoleCell) => h(RowMenu, {
      items: [{ label: t('admin.openRole', 'Open role'), icon: 'i-lucide-arrow-right', to: rolePath(row.original.name) }],
      subject: roleLabel(row.original),
    }),
  },
])

function openRole(_event: Event, row: { original: AuthorizationRoleSummaryDto }) {
  return navigateTo(rolePath(row.original.name))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Roles & permissions')"
      :description="t('admin.description', 'What each role may do. Roles come from the app configuration; assign them on a user\'s page.')"
    />

    <UEmpty
      v-if="error"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to roles') : t('admin.loadFailed', 'Roles could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <TableCard v-else>
      <UTable
        :data="roles ?? []"
        :columns="columns"
        :ui="tableUi()"
        @select="openRole"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-shield"
            variant="naked"
            :title="t('admin.noRoles', 'No roles are configured')"
            :description="t('admin.noRolesHint', 'Define them in `authorization.roles`.')"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
