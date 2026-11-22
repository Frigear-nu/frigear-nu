<script setup lang="ts">
import { computed, useFetch, useModuleT } from '#imports'
import type { RoleGrant } from '../../utils/grants'
import { authorizationApi } from '../../utils/api'

defineOptions({ name: 'GrantRoleField' })

// The field of the `role` grant kind: one global role. The roles admin route (`roles:read`) lists
// them when the caller may read it; otherwise the role is typed in.

defineProps<{ disabled?: boolean }>()
const model = defineModel<RoleGrant>({ required: true })
const t = useModuleT('authorization')

const { data: roles } = useFetch<{ name: string, label: string }[]>(authorizationApi.admin.roles, {
  key: 'authorization:role-grant-options',
  server: false,
  lazy: true,
  default: () => [],
  onResponseError: () => {},
})
// A stored role the list does not know stays selectable.
const items = computed(() => {
  const known = (roles.value ?? []).map(role => ({ label: role.label || role.name, value: role.name }))
  const current = model.value.role
  return current && !known.some(item => item.value === current) ? [...known, { label: current, value: current }] : known
})

const set = (role: string) => {
  model.value = { kind: 'role', role }
}
</script>

<template>
  <USelectMenu
    v-if="(roles ?? []).length"
    :model-value="model.role"
    :items="items"
    value-key="value"
    class="w-full"
    :disabled="disabled"
    :placeholder="t('grants.role.placeholder', 'Choose a role')"
    @update:model-value="(value: string) => set(value)"
  />
  <UInput
    v-else
    :model-value="model.role"
    class="w-full"
    :disabled="disabled"
    :placeholder="t('grants.role.typed', 'Role name, for example admin')"
    @update:model-value="(value: string | number) => set(String(value).trim())"
  />
</template>
