<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { $fetch, computed, ref, useFetch, useId, useModuleT, watch } from '#imports'
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

// Teams are searched on the server (name in any language), so every team can be picked, not only the first page.
const search = ref('')
const q = refDebounced(search, 250)
const { data: teams, status: teamsStatus } = useFetch<{ items: AdminTeamDto[] }>(teamsApi.admin.teams, {
  // One key per field: several grant rows search on their own.
  key: `teams:grant-teams:${useId()}`,
  query: computed(() => ({ pageSize: 50, ...(q.value.trim() ? { q: q.value.trim() } : {}) })),
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

// The chosen team, kept outside the search results so its name, owner and kind stay known while searching. A stored
// grant's team is loaded once.
const selected = ref<AdminTeamDto>()
watch(teamId, async (id) => {
  if (!id || selected.value?.id === id) return
  const listed = teams.value?.items.find(item => item.id === id)
  if (listed) {
    selected.value = listed
    return
  }
  selected.value = await $fetch<AdminTeamDto>(teamsApi.admin.team(id)).catch(() => undefined)
}, { immediate: true })

// Teams of several operations often share a name ("Bar"): the owner tells them apart.
const ownerOf = (team: AdminTeamDto) => team.ownerLabel
  ? tr(team.ownerLabel)
  : team.ownerType === 'platform' ? t('grants.platform', 'Platform') : [team.ownerType, team.ownerId].filter(Boolean).join(' ')
const teamItem = (team: AdminTeamDto) => ({ label: tr(team.name), description: ownerOf(team), value: team.id })
const teamItems = computed(() => {
  const items = (teams.value?.items ?? []).map(teamItem)
  const current = selected.value?.id === teamId.value ? selected.value : undefined
  if (current && !items.some(item => item.value === current.id)) items.push(teamItem(current))
  return keepCurrent(items, teamId.value)
})
const kindItems = computed(() => keepCurrent((ladders.value ?? []).map(ladder => ({ label: ladder.kind, value: ladder.kind })), teamKind.value))

// The kind whose ladder the role comes from: the chosen kind, or the chosen team's kind.
const ladderKind = computed(() => scope.value === 'kind'
  ? teamKind.value
  : (teams.value?.items.find(item => item.id === teamId.value) ?? (selected.value?.id === teamId.value ? selected.value : undefined))?.kind)
const roleItems = computed(() => {
  const ladder = ladderKind.value ? ladders.value?.find(item => item.kind === ladderKind.value) : undefined
  return keepCurrent((ladder?.roles ?? []).map(role => ({ label: tr(role.label), value: role.key })), model.value.minRole)
})

const setScope = (value: Scope) => {
  if (value === scope.value) return
  model.value = value === 'kind' ? { kind: 'team', teamKind: '', minRole: '' } : { kind: 'team', teamId: '', minRole: '' }
}
const setTarget = (value: string) => {
  if (scope.value === 'team') selected.value = teams.value?.items.find(item => item.id === value) ?? selected.value
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
      v-model:search-term="search"
      :model-value="teamId"
      :items="teamItems"
      value-key="value"
      ignore-filter
      :loading="teamsStatus === 'pending'"
      class="w-full"
      :disabled="disabled"
      :placeholder="t('grants.chooseTeam', 'Choose a team')"
      :search-input="{ placeholder: t('grants.searchTeams', 'Search teams') }"
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
