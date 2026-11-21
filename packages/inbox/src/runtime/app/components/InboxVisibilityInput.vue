<script setup lang="ts">
import type { Visibility } from '../../../types'
import { computed, useModuleT } from '#imports'

defineOptions({ name: 'InboxVisibilityInput' })

// Edits who reads a mailbox (`@frigear-nu/audience` visibility, never public): global roles, a team role and an
// operation. Staff with `inbox:manage` read every mailbox anyway, and a team's leads read its team mailbox.
const model = defineModel<Visibility | null | undefined>()
const t = useModuleT('inbox')

const patch = (values: Partial<Visibility>) => {
  const next = Object.fromEntries(Object.entries({ ...(model.value ?? {}), ...values })
    .filter(([key, value]) => key !== 'public' && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length))) as Visibility
  model.value = Object.keys(next).length ? next : null
}
const roles = computed({ get: () => model.value?.globalRoles ?? [], set: value => patch({ globalRoles: value }) })
const operationId = computed({ get: () => model.value?.operationId ?? '', set: value => patch({ operationId: value.trim() || undefined }) })
const teamKind = computed({ get: () => model.value?.minTeamRole?.kind ?? '', set: kind => patch({ minTeamRole: kind.trim() ? { kind: kind.trim(), role: model.value?.minTeamRole?.role ?? '' } : undefined }) })
const teamRole = computed({ get: () => model.value?.minTeamRole?.role ?? '', set: role => patch({ minTeamRole: teamKind.value ? { kind: teamKind.value, role: role.trim() } : undefined }) })
</script>

<template>
  <div class="flex flex-col gap-3">
    <UFormField
      name="visibility.globalRoles"
      :label="t('visibility.roles', 'Roles that read it')"
      :description="t('visibility.rolesHelp', 'Global roles, such as coordinator.')"
    >
      <TagInput v-model="roles" />
    </UFormField>
    <UFormField
      name="visibility.minTeamRole"
      :label="t('visibility.teamRole', 'Team role and up')"
      :description="t('visibility.teamRoleHelp', 'A team kind and a role of its ladder, such as bar and ba.')"
    >
      <div class="grid grid-cols-2 gap-2">
        <UInput
          v-model="teamKind"
          :placeholder="t('visibility.teamKind', 'Team kind')"
        />
        <UInput
          v-model="teamRole"
          :placeholder="t('visibility.role', 'Role')"
          :disabled="!teamKind"
        />
      </div>
    </UFormField>
    <UFormField
      name="visibility.operationId"
      :label="t('visibility.operation', 'Only people taking part in operation')"
    >
      <UInput
        v-model="operationId"
        placeholder="opr_…"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
