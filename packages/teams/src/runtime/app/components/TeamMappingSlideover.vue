<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { StaffTeam, StaffTeamLadder, StaffTeamMapping } from '../utils/admin-team'
import { teamRoleOptions } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import type { TeamOwner } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamMappingSlideover' })

// Creates or edits a role mapping rule of an owner: people with a global role (or an active plan) hold a team role on
// one team (`team`) or every team of the owner. Opened by `useTeamMappingActions()`; closes with the saved rule.
const props = defineProps<{ owner: TeamOwner, ladders: StaffTeamLadder[], team?: StaffTeam, mapping?: StaffTeamMapping }>()
const emit = defineEmits<{ close: [saved: StaffTeamMapping | false] }>()

const t = useModuleT('teams')
const tr = useTeamsTranslate()
const { busy, run } = useAction()

const schema = z.object({
  matchType: z.enum(['role', 'plan']),
  matchValue: z.string().trim().min(1, t('admin.matchRequired', 'Enter a role or a plan.')),
  scope: z.enum(['team', 'owner']),
  teamRole: z.string().min(1, t('admin.roleRequired', 'Choose a role.')),
  priority: z.number().int().min(-1000).max(1000),
})
type State = z.output<typeof schema>

const match = props.mapping?.match
const state = reactive<State>({
  matchType: match && 'plan' in match ? 'plan' : 'role',
  matchValue: match ? ('plan' in match ? match.plan : match.role) : '',
  scope: props.mapping ? (props.mapping.teamId ? 'team' : 'owner') : (props.team ? 'team' : 'owner'),
  teamRole: props.mapping?.teamRole ?? '',
  priority: props.mapping?.priority ?? 0,
})

const matchTypeOptions = computed(() => [
  { label: t('admin.matchRole', 'A global role'), value: 'role' },
  { label: t('admin.matchPlan', 'An active subscription plan'), value: 'plan' },
])
const scopeOptions = computed(() => [
  ...(props.team || props.mapping?.teamId ? [{ label: t('admin.scopeTeam', 'This team only'), value: 'team' }] : []),
  { label: t('admin.scopeOwner', 'Every team of the owner'), value: 'owner' },
])
// One team: its kind's ladder. Every team: the roles of every ladder.
const roleOptions = computed(() => {
  if (state.scope === 'team' && props.team) return teamRoleOptions(props.ladders, props.team.kind, tr)
  const seen = new Map<string, string>()
  for (const ladder of props.ladders) for (const option of teamRoleOptions([ladder], ladder.kind, tr)) if (!seen.has(option.value)) seen.set(option.value, option.label)
  return [...seen].map(([value, label]) => ({ value, label }))
})

async function save(event: FormSubmitEvent<State>) {
  const data = event.data
  const body = {
    match: data.matchType === 'plan' ? { plan: data.matchValue } : { role: data.matchValue },
    teamRole: data.teamRole,
    priority: data.priority,
    teamId: data.scope === 'team' ? (props.team?.id ?? props.mapping?.teamId ?? null) : null,
  }
  const saved = await run(
    () => props.mapping
      ? $fetch<StaffTeamMapping>(teamsApi.admin.mapping(props.mapping.id), { method: 'PATCH', body })
      : $fetch<StaffTeamMapping>(teamsApi.admin.mappings, { method: 'POST', body: { ...body, ownerType: props.owner.ownerType, ownerId: props.owner.ownerId } }),
    { success: props.mapping ? t('admin.mappingSaved', 'Saved the mapping rule') : t('admin.mappingCreated', 'Added the mapping rule') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="team-mapping-form"
    :title="mapping ? t('admin.editMapping', 'Edit mapping rule') : t('admin.addMapping', 'Add mapping rule')"
    :description="t('admin.mappingHelp', 'People who meet the rule hold the team role without being added. An explicit membership always wins.')"
    :submit-label="mapping ? t('admin.saveMapping', 'Save mapping rule') : t('admin.addMappingAction', 'Add mapping rule')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="team-mapping-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="matchType"
        :label="t('admin.matchType', 'Who')"
        required
      >
        <USelect
          v-model="state.matchType"
          :items="matchTypeOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="matchValue"
        :label="state.matchType === 'plan' ? t('admin.plan', 'Plan') : t('admin.globalRole', 'Global role')"
        :description="state.matchType === 'plan' ? t('admin.planHelp', 'The plan key, such as yearly. Needs the subscriptions module.') : t('admin.globalRoleHelp', 'Such as barmanager. Roles that inherit it match too.')"
        required
      >
        <UInput
          v-model="state.matchValue"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="scope"
        :label="t('admin.scope', 'Teams')"
        required
      >
        <USelect
          v-model="state.scope"
          :items="scopeOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="teamRole"
        :label="t('admin.teamRole', 'Team role')"
        required
      >
        <USelect
          v-model="state.teamRole"
          :items="roleOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="priority"
        :label="t('admin.priority', 'Priority')"
        :description="t('admin.priorityHelp', 'When several rules match one person on a team, the highest priority wins, then the higher role.')"
      >
        <UInputNumber
          v-model="state.priority"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
