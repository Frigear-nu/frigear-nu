<script setup lang="ts">
import { authorizationApi } from '../../utils/api'
import type { AuthorizationRoleDto, AuthorizationRoleSummaryDto } from '../../utils/api'
import RolePermissions from '../admin/RolePermissions.vue'
import RoleUsers from '../admin/RoleUsers.vue'
import { useQueryTab, useRbacLabels } from '../admin/useRbacLabels'
import { computed, errorMessage, useFetch, useRoute } from '#imports'

defineOptions({ name: 'AuthorizationAdminRolePage' })

const { t, rolesPath, rolePath, sourceLabel, sourceColors } = useRbacLabels()
const route = useRoute()
const name = computed(() => route.params.name as string)
const tab = useQueryTab(['permissions', 'users'] as const)

const [{ data: role, error, refresh }, { data: roles }] = await Promise.all([
  useFetch<AuthorizationRoleDto>(() => authorizationApi.admin.role(name.value)),
  useFetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, { key: 'authorization-admin-roles' }),
])
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
const labelOf = (value: string) => roles.value?.find(candidate => candidate.name === value)?.label ?? value

const tabs = computed(() => [
  { value: 'permissions', label: t('admin.tabs.permissions', 'Permissions'), icon: 'i-lucide-shield-check', badge: role.value?.permissionCount },
  { value: 'users', label: t('admin.tabs.users', 'Users'), icon: 'i-lucide-users', badge: role.value?.userCount },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="error && error.statusCode !== 404"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to roles') : t('admin.detail.loadFailed', 'The role could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="error || !role"
      icon="i-lucide-shield-question"
      :title="t('admin.detail.notFound', 'Role not found')"
      :description="t('admin.detail.notFoundHint', 'Roles come from the app configuration and its modules.')"
      :actions="[{ label: t('admin.allRoles', 'All roles'), to: rolesPath, color: 'neutral', variant: 'outline' }]"
    />
    <template v-else>
      <PageHeading
        :title="role.label"
        :description="role.description ?? role.name"
        :breadcrumb="[{ label: t('admin.title', 'Roles & permissions'), to: rolesPath }, { label: role.label }]"
      >
        <template #badge>
          <StatusBadge
            :status="role.source"
            :colors="sourceColors"
            :label="sourceLabel(role.source)"
          />
          <UBadge
            v-if="role.isDefault"
            color="neutral"
            variant="outline"
            :label="t('admin.default', 'Default')"
          />
        </template>
        <div
          v-if="role.inherits.length"
          class="text-muted flex flex-wrap items-center gap-1.5 text-sm"
        >
          <span>{{ t('admin.inheritsFrom', 'Inherits from') }}</span>
          <ULink
            v-for="junior in role.inherits"
            :key="junior"
            :to="rolePath(junior)"
            class="text-highlighted font-medium"
          >
            {{ labelOf(junior) }}
          </ULink>
        </div>
      </PageHeading>

      <PageTabs
        v-model="tab"
        :items="tabs"
      />

      <RolePermissions
        v-if="tab === 'permissions'"
        :permissions="role.permissions"
        :role-label="labelOf"
      />
      <RoleUsers
        v-else
        :role="role.name"
      />
    </template>
  </div>
</template>
