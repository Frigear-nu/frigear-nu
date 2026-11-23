<script setup lang="ts">
import { computed, useFetch, useModuleT } from '#imports'
import type { RoleGrant } from '../../utils/grants'
import { authorizationApi } from '../../utils/api'
import { useRoleLabel } from '../composables/useRoleLabel'

defineOptions({ name: 'GrantRoleField' })

// The field of the `role` grant kind: one global role. The roles admin route (`roles:read`) lists
// them when the caller may read it; otherwise the role is typed in.

defineProps<{ disabled?: boolean }>()
const model = defineModel<RoleGrant>({ required: true })
const t = useModuleT('authorization')
const { roleLabel } = useRoleLabel()

const { data: roles, status } = useFetch<{ name: string, label: string, labelKey?: string | null }[]>(authorizationApi.admin.roles, {
  key: 'authorization:role-grant-options',
  server: false,
  lazy: true,
  default: () => [],
  onResponseError: () => {},
})
// Until the list answers, a disabled select stands in, so the field does not swap from a text input to a select.
const loading = computed(() => status.value === 'idle' || status.value === 'pending')
// Labels as the roles admin shows them (`labelKey`). A stored role the list does not know stays selectable.
const items = computed(() => {
  const known = (roles.value ?? []).map(role => ({ label: roleLabel({ label: role.label || role.name, labelKey: role.labelKey }), value: role.name }))
  const current = model.value.role
  return current && !known.some(item => item.value === current) ? [...known, { label: current, value: current }] : known
})

const set = (role: string) => {
  model.value = { kind: 'role', role }
}
</script>

<template>
  <USelectMenu
    v-if="loading || (roles ?? []).length"
    :model-value="model.role"
    :items="items"
    value-key="value"
    class="w-full"
    :loading="loading"
    :disabled="disabled || loading"
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
