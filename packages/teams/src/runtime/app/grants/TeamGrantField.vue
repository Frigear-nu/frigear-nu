<script setup lang="ts">
import { computed, useFetch, useModuleT } from '#imports'
import { teamsApi } from '../../utils/api'
import { isTeamKindGrant } from '../../utils/grants'
import { useTeamsTranslate } from '../composables/useTeamsTranslate'
import type { AdminTeamDto, TeamGrant, TeamLadderDto } from '../../../types'

defineOptions({ name: 'TeamGrantField' })

// The field of the `team` grant kind in `<GrantsEditor>`: one team or every team of a kind, and the lowest role on the
// kind's ladder that admits.
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

type Scope = 'team' | 'kind'
const scope = computed<Scope>(() => isTeamKindGrant(model.value) ? 'kind' : 'team')
const scopeItems = computed(() => [
  { label: t('grants.oneTeam', 'One team'), value: 'team' },
  { label: t('grants.everyTeamOfKind', 'Every team of a kind'), value: 'kind' },
])

const teamId = computed(() => isTeamKindGrant(model.value) ? '' : model.value.teamId)
const teamKind = computed(() => isTeamKindGrant(model.value) ? model.value.teamKind : '')

// A stored team, kind or role the lists do not know stays selectable.
const keepCurrent = (known: Array<{ label: string, value: string }>, current: string) =>
  current && !known.some(item => item.value === current) ? [...known, { label: current, value: current }] : known

const teamItems = computed(() => keepCurrent((teams.value?.items ?? []).map(team => ({ label: tr(team.name), value: team.id })), teamId.value))
const kindItems = computed(() => keepCurrent((ladders.value ?? []).map(ladder => ({ label: ladder.kind, value: ladder.kind })), teamKind.value))

// The kind whose ladder the role comes from: the chosen kind, or the chosen team's kind.
const ladderKind = computed(() => scope.value === 'kind'
  ? teamKind.value
  : teams.value?.items.find(item => item.id === teamId.value)?.kind)
const roleItems = computed(() => {
  const ladder = ladderKind.value ? ladders.value?.find(item => item.kind === ladderKind.value) : undefined
  return keepCurrent((ladder?.roles ?? []).map(role => ({ label: tr(role.label), value: role.key })), model.value.minRole)
})

const setScope = (value: Scope) => {
  if (value === scope.value) return
  model.value = value === 'kind' ? { kind: 'team', teamKind: '', minRole: '' } : { kind: 'team', teamId: '', minRole: '' }
}
const setTarget = (value: string) => {
  model.value = scope.value === 'kind' ? { kind: 'team', teamKind: value, minRole: '' } : { kind: 'team', teamId: value, minRole: '' }
}
const setRole = (minRole: string) => {
  model.value = { ...model.value, minRole }
}
</script>

<template>
  <div class="flex flex-col gap-2 sm:flex-row">
    <USelect
      :model-value="scope"
      :items="scopeItems"
      value-key="value"
      class="w-full sm:w-48"
      :disabled="disabled"
      :aria-label="t('grants.scope', 'Applies to')"
      @update:model-value="(value: string) => setScope(value as Scope)"
    />
    <USelectMenu
      v-if="scope === 'team'"
      :model-value="teamId"
      :items="teamItems"
      value-key="value"
      class="w-full"
      :disabled="disabled"
      :placeholder="t('grants.chooseTeam', 'Choose a team')"
      @update:model-value="(value: string) => setTarget(value)"
    />
    <USelectMenu
      v-else
      :model-value="teamKind"
      :items="kindItems"
      value-key="value"
      class="w-full"
      :disabled="disabled"
      :placeholder="t('grants.chooseKind', 'Choose a team kind')"
      @update:model-value="(value: string) => setTarget(value)"
    />
    <USelectMenu
      :model-value="model.minRole"
      :items="roleItems"
      value-key="value"
      class="w-full"
      :disabled="disabled || !ladderKind"
      :placeholder="t('grants.minRole', 'At least this role')"
      @update:model-value="(value: string) => setRole(value)"
    />
  </div>
</template>
