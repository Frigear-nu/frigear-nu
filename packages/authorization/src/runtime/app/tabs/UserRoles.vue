<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { authorizationApi } from '../../utils/api'
import type { AuthorizationAssignedRoleDto, AuthorizationRoleSummaryDto, AuthorizationUserRolesDto } from '../../utils/api'
import { useRoleLabels } from '../admin/useRoleLabels'
import { useUserRoleActions } from '../admin/useUserRoleActions'
import { computed, errorMessage, h, resolveComponent, tableUi, useFetch, useFormat } from '#imports'

defineOptions({ name: 'AuthorizationUserRolesTab' })

// The "Roles and permissions" tab of the users admin's user page (`admin.users`): the roles assigned to the user (staff
// with `roles:assign` edit them), the roles they hold in effect and what those let them do.
const props = defineProps<{ user: { id: number, name: string } }>()

const { t, translated, rolePath, roleLabel, sourceLabel, sourceColors } = useRoleLabels()
const format = useFormat()
const actions = useUserRoleActions()

const [{ data, status, error, refresh }, { data: roles }] = await Promise.all([
  useFetch<AuthorizationUserRolesDto>(() => authorizationApi.admin.userRoles(props.user.id), { key: `authorization-user-roles-${props.user.id}` }),
  useFetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, { key: 'authorization-admin-roles' }),
])
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
const loading = computed(() => status.value === 'pending' && !data.value)
const labelOf = (name: string) => {
  const role = roles.value?.find(candidate => candidate.name === name)
  return role ? roleLabel(role) : name
}
// Whether the caller may change anything: some role to give, or a managed role they may take away.
const canEdit = computed(() => !!data.value?.assignable.length)

async function editRoles() {
  if (!data.value) return
  const saved = await actions.edit(props.user, data.value)
  if (saved) data.value = saved
}

const StatusBadge = resolveComponent('StatusBadge')
const TableIdentity = resolveComponent('TableIdentity')
const UBadge = resolveComponent('UBadge')

type AssignedCell = { row: { original: AuthorizationAssignedRoleDto } }
const assignedColumns = computed<TableColumn<AuthorizationAssignedRoleDto>[]>(() => [
  {
    accessorKey: 'role',
    header: t('admin.role', 'Role'),
    cell: ({ row }: AssignedCell) => h(TableIdentity, {
      title: labelOf(row.original.role),
      description: row.original.known ? row.original.role : t('admin.userRoles.unknown', '"{role}" is not configured: ignored', { role: row.original.role }),
      to: row.original.known ? rolePath(row.original.role) : undefined,
    }),
  },
  {
    accessorKey: 'source',
    header: t('admin.sourceHeader', 'Source'),
    cell: ({ row }: AssignedCell) => h(StatusBadge, { status: row.original.source, colors: sourceColors, label: sourceLabel(row.original.source) }),
  },
  {
    accessorKey: 'assignedAt',
    header: t('admin.assignedAt', 'Assigned'),
    cell: ({ row }: AssignedCell) => format.date(row.original.assignedAt),
  },
])

type PermissionRow = { name: string, label: string | null, labelKey: string | null, sensitive: boolean }
const permissionRows = computed<PermissionRow[]>(() => (data.value?.permissions ?? []).map(name => ({ name, label: null, labelKey: null, sensitive: name.endsWith(':pii') })))
const permissionColumns = computed<TableColumn<PermissionRow>[]>(() => [
  {
    accessorKey: 'name',
    header: t('admin.permission', 'Permission'),
    cell: ({ row }) => h(TableIdentity, { title: translated(row.original.labelKey, row.original.name) }, {
      badges: () => row.original.sensitive ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm', label: t('admin.sensitive', 'Sensitive') }) : null,
    }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="error"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to roles') : t('admin.userRoles.loadFailed', 'The roles could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <template v-else>
      <TableCard
        :title="t('admin.userRoles.assigned', 'Assigned roles')"
        :loading="loading"
      >
        <template
          v-if="canEdit"
          #actions
        >
          <UButton
            :label="t('admin.userRoles.edit', 'Edit roles')"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            size="sm"
            @click="editRoles"
          />
        </template>
        <UTable
          :data="data?.assigned ?? []"
          :columns="assignedColumns"
          :ui="tableUi({ tr: '' })"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-shield"
              variant="naked"
              :title="t('admin.userRoles.none', 'No roles assigned')"
              :description="t('admin.userRoles.noneHint', 'The user still holds the default and automatic roles.')"
              :actions="canEdit ? [{ label: t('admin.userRoles.edit', 'Edit roles'), color: 'neutral', variant: 'outline', onClick: editRoles }] : []"
            />
          </template>
        </UTable>
      </TableCard>

      <SectionCard
        :title="t('admin.userRoles.effective', 'Roles in effect')"
        :description="t('admin.userRoles.effectiveHint', 'Assigned, default and automatic roles whose requirements hold, and the roles they inherit.')"
        :loading="loading"
      >
        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="role in data?.effective ?? []"
            :key="role"
            color="neutral"
            variant="outline"
            :label="labelOf(role)"
          />
          <span
            v-if="!data?.effective.length"
            class="text-muted text-sm"
          >{{ t('admin.userRoles.noEffective', 'None') }}</span>
        </div>
      </SectionCard>

      <TableCard
        :title="t('admin.userRoles.permissions', 'Permissions ({count})', { count: data?.permissions.length ?? 0 })"
        :loading="loading"
      >
        <UTable
          :data="permissionRows"
          :columns="permissionColumns"
          :ui="tableUi({ tr: '' })"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-shield-off"
              variant="naked"
              :title="t('admin.userRoles.noPermissions', 'No permissions')"
            />
          </template>
        </UTable>
      </TableCard>
    </template>
  </div>
</template>
