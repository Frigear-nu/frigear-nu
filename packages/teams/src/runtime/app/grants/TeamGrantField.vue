<script setup lang="ts">
import { computed, useFetch, useModuleT } from '#imports'
import { teamsApi } from '../../utils/api'
import { useTeamsTranslate } from '../composables/useTeamsTranslate'
import type { AdminTeamDto, TeamGrant, TeamLadderDto } from '../../../types'

defineOptions({ name: 'TeamGrantField' })

// The field of the `team` grant kind in `<GrantsEditor>`: one team, and the lowest role on its ladder that admits.
defineProps<{ disabled?: boolean }>()
const model = defineModel<TeamGrant>({ required: true })
const t = useModuleT('teams')
const tr = useTeamsTranslate()

const { data: teams } = useFetch<{ items: AdminTeamDto[] }>(teamsApi.admin.teams, {
  key: 'teams:grant-teams',
  query: { pageSize: 100 },
  server: false,
  lazy: true,
  default: () => ({ items: [] }),
})
const { data: ladders } = useFetch<TeamLadderDto[]>(teamsApi.admin.ladders, {
  key: 'teams:grant-ladders',
  server: false,
  lazy: true,
  default: () => [],
})

// A stored team or role the lists do not know stays selectable.
const teamItems = computed(() => {
  const known = (teams.value?.items ?? []).map(team => ({ label: tr(team.name), value: team.id }))
  const current = model.value.teamId
  return current && !known.some(item => item.value === current) ? [...known, { label: current, value: current }] : known
})
const roleItems = computed(() => {
  const team = teams.value?.items.find(item => item.id === model.value.teamId)
  const ladder = team ? ladders.value?.find(item => item.kind === team.kind) : undefined
  const known = (ladder?.roles ?? []).map(role => ({ label: tr(role.label), value: role.key }))
  const current = model.value.minRole
  return current && !known.some(item => item.value === current) ? [...known, { label: current, value: current }] : known
})

const set = (patch: Partial<TeamGrant>) => {
  model.value = { kind: 'team', teamId: model.value.teamId, minRole: model.value.minRole, ...patch }
}
</script>

<template>
  <div class="flex flex-col gap-2 sm:flex-row">
    <USelectMenu
      :model-value="model.teamId"
      :items="teamItems"
      value-key="value"
      class="w-full"
      :disabled="disabled"
      :placeholder="t('grants.chooseTeam', 'Choose a team')"
      @update:model-value="(value: string) => set({ teamId: value, minRole: '' })"
    />
    <USelectMenu
      :model-value="model.minRole"
      :items="roleItems"
      value-key="value"
      class="w-full"
      :disabled="disabled || !model.teamId"
      :placeholder="t('grants.minRole', 'At least this role')"
      @update:model-value="(value: string) => set({ minRole: value })"
    />
  </div>
</template>
