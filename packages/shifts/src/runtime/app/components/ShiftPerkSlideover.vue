<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftPerkDto, Translated } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftPerkSlideover' })

// A perk of an operation: a meal or drink voucher for one team or all of them, as an allowance per shift or a budget per
// person across the whole operation. Opened by `useShiftsActions()`; closes with the saved perk, or `false`.
const props = defineProps<{ operationId: string, teams: ShiftsTeamOption[], perk?: ShiftPerkDto }>()
const emit = defineEmits<{ close: [saved: ShiftPerkDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()

const ALL = '__all__'
const schema = z.object({
  name: z.custom<Translated>(value => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value as Record<string, string>).some(text => text?.trim())), t('perks.nameRequired', 'Give the perk a name.')),
  kind: z.enum(['meal', 'drink', 'other']),
  teamId: z.string(),
  per: z.enum(['perShift', 'perPerson']),
  amount: z.number().int().min(1, t('perks.amountMin', 'At least 1.')).max(1000),
})
type State = z.output<typeof schema>
const state = reactive<State>({
  name: props.perk?.name ?? '',
  kind: props.perk?.kind ?? 'meal',
  teamId: props.perk?.teamId ?? ALL,
  per: props.perk?.perPerson != null ? 'perPerson' : 'perShift',
  amount: props.perk?.perShift ?? props.perk?.perPerson ?? 1,
})

const kindOptions = computed(() => [
  { label: t('perks.kinds.meal', 'Meal'), value: 'meal' },
  { label: t('perks.kinds.drink', 'Drink'), value: 'drink' },
  { label: t('perks.kinds.other', 'Other'), value: 'other' },
])
const teamOptions = computed(() => [{ label: t('admin.allTeams', 'All teams'), value: ALL }, ...props.teams.map(team => ({ label: tr(team.name), value: team.id }))])
const perOptions = computed(() => [
  { label: t('perks.perShift', 'Per shift'), description: t('perks.perShiftHelp', 'Each assignment gets this many.'), value: 'perShift' },
  { label: t('perks.perPerson', 'Per person'), description: t('perks.perPersonHelp', 'Each person gets this many across the whole operation.'), value: 'perPerson' },
])

async function save(event: FormSubmitEvent<State>) {
  const { data } = event
  const allowance = data.per === 'perShift' ? { perShift: data.amount } : { perPerson: data.amount }
  const body = { name: data.name, kind: data.kind, teamId: data.teamId === ALL ? null : data.teamId, ...allowance }
  const saved = await run(
    () => props.perk
      ? $fetch<ShiftPerkDto>(shiftsApi.admin.perk(props.perk.id), { method: 'PATCH', body })
      : $fetch<ShiftPerkDto>(shiftsApi.admin.perks(props.operationId), { method: 'POST', body }),
    { success: t('perks.saved', 'Saved {name}', { name: tr(data.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="shift-perk-form"
    :title="perk ? t('perks.editTitle', 'Edit perk') : t('perks.newTitle', 'New perk')"
    :description="t('perks.description', 'A meal or drink a lead hands out by scanning a volunteer\'s check-in pass.')"
    :submit-label="perk ? t('perks.save', 'Save perk') : t('perks.create', 'Add perk')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-perk-form"
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
        name="kind"
        :label="t('perks.kind', 'Kind')"
      >
        <USelect
          v-model="state.kind"
          :items="kindOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="teamId"
        :label="t('admin.team', 'Team')"
        :description="t('perks.teamHelp', 'Only people on this team can get it.')"
      >
        <USelect
          v-model="state.teamId"
          :items="teamOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="per"
        :label="t('perks.allowance', 'Allowance')"
      >
        <URadioGroup
          v-model="state.per"
          :items="perOptions"
        />
      </UFormField>
      <UFormField
        name="amount"
        :label="t('perks.amount', 'How many')"
        required
      >
        <UInputNumber
          v-model="state.amount"
          :min="1"
          :max="1000"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
