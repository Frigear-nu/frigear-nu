<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { authorizationApi } from '../../utils/api'
import type { AuthorizationRoleSummaryDto, AuthorizationUserRolesDto } from '../../utils/api'
import { useRoleLabels } from './useRoleLabels'
import { $fetch, computed, reactive, useAction, useFetch } from '#imports'

defineOptions({ name: 'AuthorizationUserRolesSlideover' })

// The roles staff assign to a user. Roles the caller may not manage (they hold permissions the caller does not) are
// shown but locked; single sign-on roles follow the identity provider. Closes with the saved roles, or `false`.
const props = defineProps<{
  user: { id: number, name: string }
  roles: AuthorizationUserRolesDto
}>()
const emit = defineEmits<{ close: [saved: AuthorizationUserRolesDto | false] }>()

const { t, roleLabel } = useRoleLabels()
const { busy, run } = useAction()

const { data: allRoles } = await useFetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, { key: 'authorization-admin-roles' })

const sso = computed(() => props.roles.assigned.filter(row => row.source === 'sso').map(row => row.role))
const managed = computed(() => props.roles.assigned.filter(row => row.source !== 'sso').map(row => row.role))

// Every assignable role, plus the managed ones the user has (also when the caller may not change them).
const items = computed(() => {
  const roles = (allRoles.value ?? []).filter(role => role.assignable || managed.value.includes(role.name))
  return roles.map(role => ({
    value: role.name,
    label: roleLabel(role),
    description: sso.value.includes(role.name)
      ? t('admin.userRoles.fromSso', 'Given by single sign-on')
      : !props.roles.assignable.includes(role.name)
          ? t('admin.userRoles.locked', 'It holds permissions you do not have')
          : role.description ?? undefined,
    disabled: sso.value.includes(role.name) || !props.roles.assignable.includes(role.name),
  }))
})

const schema = z.object({ roles: z.array(z.string()) })
type Schema = z.output<typeof schema>
const state = reactive<Schema>({ roles: [...managed.value, ...sso.value] })

async function save(event: FormSubmitEvent<Schema>) {
  const roles = event.data.roles.filter(role => !sso.value.includes(role))
  const saved = await run(
    () => $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(props.user.id), { method: 'PUT', body: { roles } }),
    { success: t('admin.userRoles.saved', 'Roles of {name} saved', { name: props.user.name }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="authorization-user-roles-form"
    :title="t('admin.userRoles.editTitle', 'Edit roles of {name}', { name: user.name })"
    :description="t('admin.userRoles.editDescription', 'You can only give or take away roles whose permissions you hold yourself.')"
    :submit-label="t('admin.userRoles.save', 'Save roles')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="authorization-user-roles-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="roles"
        :label="t('admin.userRoles.roles', 'Roles')"
        :description="t('admin.userRoles.rolesHint', 'Default and automatic roles are not listed: users hold them without being assigned.')"
      >
        <UCheckboxGroup
          v-model="state.roles"
          :items="items"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
