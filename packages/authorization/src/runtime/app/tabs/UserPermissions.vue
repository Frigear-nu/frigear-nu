<script setup lang="ts">
import { authorizationApi } from '../../utils/api'
import type { AuthorizationRoleDto } from '../../utils/api'
import RolePermissions from '../admin/RolePermissions.vue'
import { useRbacLabels } from '../admin/useRbacLabels'
import { computed, errorMessage, useFetch, useRuntimeConfig } from '#imports'

defineOptions({ name: 'AuthorizationUserPermissionsTab' })

// The "Permissions" tab of the users admin's user page (`admin.users`): the user's role and what it lets them do.
const props = defineProps<{ user: { id: number, name: string, role?: string | null } }>()

const { t, rolePath } = useRbacLabels()
// A stored role the app does not know acts as the default role.
const rbac = useRuntimeConfig().public.authorization?.rbac
const roleName = computed(() => rbac?.roles.some(role => role.name === props.user.role) ? props.user.role! : (rbac?.defaultRole ?? 'user'))
const unknownRole = computed(() => !!props.user.role && props.user.role !== roleName.value)
const labelOf = (name: string) => rbac?.roles.find(role => role.name === name)?.label ?? name

const { data: role, status, error } = useFetch<AuthorizationRoleDto>(() => authorizationApi.admin.role(roleName.value))
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="error"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to roles') : t('admin.detail.loadFailed', 'The role could not be loaded')"
      :description="errorMessage(error, '')"
    />
    <template v-else>
      <SectionCard
        :title="t('admin.tab.role', 'Role')"
        :loading="status === 'pending' && !role"
      >
        <template #actions>
          <UButton
            :label="t('admin.tab.openRole', 'Open role')"
            :to="rolePath(roleName)"
            color="neutral"
            variant="outline"
            size="sm"
            trailing-icon="i-lucide-arrow-right"
          />
        </template>
        <div class="flex flex-col gap-1">
          <p class="text-highlighted font-medium">
            {{ role?.label ?? labelOf(roleName) }}
          </p>
          <p
            v-if="role?.description"
            class="text-muted text-sm"
          >
            {{ role.description }}
          </p>
          <p
            v-if="unknownRole"
            class="text-warning text-sm"
          >
            {{ t('admin.tab.unknownRole', 'The stored role "{role}" does not exist, so this user acts as {fallback}.', { role: user.role ?? '', fallback: labelOf(roleName) }) }}
          </p>
        </div>
      </SectionCard>
      <TableCard
        v-if="status === 'pending' && !role"
        loading
      />
      <RolePermissions
        v-else-if="role"
        :permissions="role.permissions"
        :role-label="labelOf"
        held-only
      />
    </template>
  </div>
</template>
