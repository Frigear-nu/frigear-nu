<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { StaffTeam, StaffTeamLadder } from '../utils/admin-team'
import { TEAM_OWNER_TYPES } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import { DEFAULT_TEAM_KIND } from '../../utils/ladders'
import type { TeamOwner, Translated } from '../../../types'
import { $fetch, computed, reactive, useAction, useLazyFetch, useModuleT, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamFormSlideover' })

// Create and edit form of a team, opened with `useOverlay()` by `useTeamActions()`: it closes with the saved team, or
// `false` when cancelled. `owner` fixes the owner (the Teams tab of an operation). The owner and kind are fixed once
// the team exists.
const props = defineProps<{ team?: StaffTeam, owner?: TeamOwner }>()
const emit = defineEmits<{ close: [saved: StaffTeam | false] }>()

const t = useModuleT('teams')
const tr = useTeamsTranslate()
const { busy, run } = useAction()
const { data: ladders } = useLazyFetch<StaffTeamLadder[]>(teamsApi.admin.ladders, { default: () => [] })

const ownerFixed = computed(() => !!props.team || !!props.owner)
const kindOptions = computed(() => ladders.value.map(ladder => ({ label: ladder.kind, value: ladder.kind })))
const ownerTypeOptions = computed(() => TEAM_OWNER_TYPES.map(value => ({ label: t(`admin.ownerTypes.${value}`, value === 'platform' ? 'Platform' : 'Operation'), value })))

const schema = z.object({
  name: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
  description: z.custom<Translated | undefined>().optional(),
  kind: z.string().min(1, t('admin.kindRequired', 'Choose a kind.')),
  ownerType: z.string().min(1),
  ownerId: z.string().trim().optional(),
  capacity: z.number().int().min(0).optional(),
  sort: z.number().int().optional(),
}).refine(value => value.ownerType === 'platform' || !!value.ownerId, { message: t('admin.ownerIdRequired', 'Enter the owner\'s id.'), path: ['ownerId'] })

type State = z.output<typeof schema>

const state = reactive<State>(props.team
  ? { name: props.team.name, description: props.team.description ?? undefined, kind: props.team.kind, ownerType: props.team.ownerType, ownerId: props.team.ownerId ?? '', capacity: props.team.capacity ?? undefined, sort: props.team.sort }
  : { name: undefined, description: undefined, kind: DEFAULT_TEAM_KIND, ownerType: props.owner?.ownerType ?? 'platform', ownerId: props.owner?.ownerId ?? '', capacity: undefined, sort: 0 })

const isEmpty = (value: Translated | null | undefined) =>
  value === undefined || value === null || (typeof value === 'string' ? !value.trim() : !Object.values(value).some(text => text.trim()))

async function save(event: FormSubmitEvent<State>) {
  const data = event.data
  const fields = {
    name: data.name,
    description: isEmpty(data.description) ? null : data.description,
    capacity: data.capacity ?? null,
    sort: data.sort ?? 0,
  }
  const saved = await run(
    () => props.team
      ? $fetch<StaffTeam>(teamsApi.admin.team(props.team.id), { method: 'PATCH', body: fields })
      : $fetch<StaffTeam>(teamsApi.admin.teams, { method: 'POST', body: { ...fields, kind: data.kind, ownerType: data.ownerType, ownerId: data.ownerType === 'platform' ? null : data.ownerId } }),
    { success: props.team
      ? t('admin.saved', 'Saved {name}', { name: tr(data.name) })
      : t('admin.created', 'Created {name}', { name: tr(data.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="team-form"
    :title="team ? t('admin.editTitle', 'Edit team') : t('admin.create', 'Add team')"
    :submit-label="team ? t('admin.saveTeam', 'Save team') : t('admin.createAction', 'Create team')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="team-form"
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
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="kind"
        :label="t('admin.kind', 'Kind')"
        :description="t('admin.kindHelp', 'The kind decides the role ladder of its members.')"
        required
      >
        <USelect
          v-model="state.kind"
          :items="kindOptions"
          :disabled="!!team"
          class="w-full"
        />
      </UFormField>
      <template v-if="!ownerFixed">
        <UFormField
          name="ownerType"
          :label="t('admin.ownerType', 'Owner')"
          required
        >
          <USelect
            v-model="state.ownerType"
            :items="ownerTypeOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="state.ownerType !== 'platform'"
          name="ownerId"
          :label="t('admin.ownerId', 'Owner id')"
          :description="t('admin.ownerIdHelp', 'The id of the operation the team works at.')"
          required
        >
          <UInput
            v-model="state.ownerId"
            class="w-full"
          />
        </UFormField>
      </template>
      <UFormField
        name="capacity"
        :label="t('admin.capacity', 'Capacity')"
        :description="t('admin.capacityHelp', 'How many people the team needs.')"
      >
        <UInputNumber
          v-model="state.capacity"
          :min="0"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="description"
        :label="t('admin.description', 'Description')"
      >
        <TranslatedInput v-model="state.description" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
