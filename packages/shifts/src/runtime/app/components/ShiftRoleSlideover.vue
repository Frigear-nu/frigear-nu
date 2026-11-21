<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShiftsLadder, ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsRoleOptions } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftRoleDto, Translated } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftRoleSlideover' })

// A shift role of a schedule: a team and the lowest team role that may hold it (a "BA" role needs `ba` and up). Opened
// by `useShiftsActions()`; closes with the saved role, or `false`.
const props = defineProps<{ scheduleId: string, teams: ShiftsTeamOption[], ladders: ShiftsLadder[], role?: ShiftRoleDto }>()
const emit = defineEmits<{ close: [saved: ShiftRoleDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()

const ANY = '__any__'
const schema = z.object({
  name: z.custom<Translated>(value => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value as Record<string, string>).some(text => text?.trim())), t('admin.roleNameRequired', 'Give the role a name.')),
  teamId: z.string().min(1, t('admin.teamRequired', 'Choose a team.')),
  teamRole: z.string(),
})
type State = z.output<typeof schema>
const state = reactive<State>({ name: props.role?.name ?? '', teamId: props.role?.teamId ?? props.teams[0]?.id ?? '', teamRole: props.role?.teamRole ?? ANY })

const teamOptions = computed(() => props.teams.map(team => ({ label: tr(team.name), value: team.id })))
const kind = computed(() => props.teams.find(team => team.id === state.teamId)?.kind)
const roleOptions = computed(() => [{ label: t('admin.anyRole', 'Anybody on the team'), value: ANY }, ...shiftsRoleOptions(props.ladders, kind.value, tr)])

async function save(event: FormSubmitEvent<State>) {
  const teamRole = event.data.teamRole === ANY ? null : event.data.teamRole
  const saved = await run(
    () => props.role
      ? $fetch<ShiftRoleDto>(shiftsApi.admin.role(props.role.id), { method: 'PATCH', body: { name: event.data.name, teamRole } })
      : $fetch<ShiftRoleDto>(shiftsApi.admin.roles(props.scheduleId), { method: 'POST', body: { name: event.data.name, teamId: event.data.teamId, teamRole } }),
    { success: t('admin.roleSaved', 'Saved {name}', { name: tr(event.data.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="shift-role-form"
    :title="role ? t('admin.editRole', 'Edit shift role') : t('admin.newRole', 'New shift role')"
    :description="t('admin.roleDescription', 'A role people hold on a shift, such as BA or bartender, with the lowest team role that may hold it.')"
    :submit-label="role ? t('admin.saveRole', 'Save shift role') : t('admin.createRole', 'Add shift role')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-role-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <TranslatedInput
          v-model="state.name"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="teamId"
        :label="t('admin.team', 'Team')"
        required
      >
        <USelect
          v-model="state.teamId"
          :items="teamOptions"
          :disabled="!!role"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="teamRole"
        :label="t('admin.teamRole', 'Lowest team role')"
        :description="t('admin.teamRoleHelp', 'People below it on the team\'s ladder cannot hold this role.')"
      >
        <USelect
          v-model="state.teamRole"
          :items="roleOptions"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
