<script setup lang="ts">
import type { Visibility } from '../../../types'
import { computed, useModuleT } from '#imports'

defineOptions({ name: 'MapsVisibilityInput' })

// Edits a `visibility` value (`@frigear-nu/audience`): public, or signed-in viewers narrowed by global roles, a team
// role and an operation. An empty value means "signed-in viewers"; `inherit` adds a choice that keeps `null` (a layer
// then follows its map).
const props = defineProps<{ inherit?: boolean }>()
const model = defineModel<Visibility | null | undefined>()
const t = useModuleT('maps')

type Mode = 'inherit' | 'public' | 'signedIn'
const mode = computed<Mode>({
  get: () => model.value === null || model.value === undefined ? (props.inherit ? 'inherit' : 'signedIn') : model.value.public ? 'public' : 'signedIn',
  set: (value) => {
    if (value === 'inherit') model.value = null
    else if (value === 'public') model.value = { public: true }
    else model.value = props.inherit ? {} : null
  },
})
const modes = computed(() => [
  ...(props.inherit ? [{ label: t('visibility.inherit', 'Same as the map'), value: 'inherit' }] : []),
  { label: t('visibility.public', 'Everyone, also without signing in'), value: 'public' },
  { label: t('visibility.signedIn', 'Signed-in people'), value: 'signedIn' },
])
const restricted = computed(() => mode.value === 'signedIn')

const patch = (values: Partial<Visibility>) => {
  // Unset and empty values are left out, and `public` goes: a restricted visibility is never public.
  const next = Object.fromEntries(Object.entries({ ...(model.value ?? {}), ...values })
    .filter(([key, value]) => key !== 'public' && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length))) as Visibility
  model.value = Object.keys(next).length || props.inherit ? next : null
}
const roles = computed({ get: () => model.value?.globalRoles ?? [], set: value => patch({ globalRoles: value }) })
const operationId = computed({ get: () => model.value?.operationId ?? '', set: value => patch({ operationId: value.trim() || undefined }) })
const teamKind = computed({ get: () => model.value?.minTeamRole?.kind ?? '', set: kind => patch({ minTeamRole: kind.trim() ? { kind: kind.trim(), role: model.value?.minTeamRole?.role ?? '' } : undefined }) })
const teamRole = computed({ get: () => model.value?.minTeamRole?.role ?? '', set: role => patch({ minTeamRole: teamKind.value ? { kind: teamKind.value, role: role.trim() } : undefined }) })
</script>

<template>
  <div class="flex flex-col gap-3">
    <URadioGroup
      v-model="mode"
      :items="modes"
    />
    <template v-if="restricted">
      <UFormField
        name="visibility.globalRoles"
        :label="t('visibility.roles', 'Only these roles')"
        :description="t('visibility.rolesHelp', 'Leave empty for every signed-in person.')"
      >
        <TagInput v-model="roles" />
      </UFormField>
      <UFormField
        name="visibility.minTeamRole"
        :label="t('visibility.teamRole', 'Only this team role and up')"
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
    </template>
  </div>
</template>
