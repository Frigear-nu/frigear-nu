<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftPerkDto, Translated } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftPerkSlideover' })

// A perk of an operation, for one team or all of them: every attended shift earns `quantity` of `voucherType`, which the
// vouchers app hands out. Opened by `useShiftsActions()`; closes with the saved perk, or `false`.
const props = defineProps<{ operationId: string, teams: ShiftsTeamOption[], perk?: ShiftPerkDto }>()
const emit = defineEmits<{ close: [saved: ShiftPerkDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()

const ALL = '__all__'
const schema = z.object({
  name: z.custom<Translated>(value => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value as Record<string, string>).some(text => text?.trim())), t('perks.nameRequired', 'Give the perk a name.')),
  voucherType: z.string().trim().min(1, t('perks.voucherTypeRequired', 'Name the voucher type, e.g. beer.')).max(64),
  teamId: z.string(),
  quantity: z.number().int().min(1, t('perks.amountMin', 'At least 1.')).max(1000),
})
type State = z.output<typeof schema>
const state = reactive<State>({
  name: props.perk?.name ?? '',
  voucherType: props.perk?.voucherType ?? '',
  teamId: props.perk?.teamId ?? ALL,
  quantity: props.perk?.quantity ?? 1,
})

const teamOptions = computed(() => [{ label: t('admin.allTeams', 'All teams'), value: ALL }, ...props.teams.map(team => ({ label: tr(team.name), value: team.id }))])

async function save(event: FormSubmitEvent<State>) {
  const { data } = event
  const body = { name: data.name, voucherType: data.voucherType, quantity: data.quantity, teamId: data.teamId === ALL ? null : data.teamId }
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
    :description="t('perks.description', 'What a volunteer earns for every shift they attend. The vouchers app hands it out.')"
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
        name="voucherType"
        :label="t('perks.voucherType', 'Voucher type')"
        :description="t('perks.voucherTypeHelp', 'What the vouchers app hands out, e.g. beer or meal.')"
        required
      >
        <UInput
          v-model="state.voucherType"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="quantity"
        :label="t('perks.quantity', 'Per shift')"
        :description="t('perks.quantityHelp', 'How many one attended shift earns.')"
        required
      >
        <UInputNumber
          v-model="state.quantity"
          :min="1"
          :max="1000"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="teamId"
        :label="t('admin.team', 'Team')"
        :description="t('perks.teamHelp', 'Only shifts of this team earn it.')"
      >
        <USelect
          v-model="state.teamId"
          :items="teamOptions"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
