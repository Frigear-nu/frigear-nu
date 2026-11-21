<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { shiftsApi } from '../../utils/api'
import type { ShiftScheduleDto, Translated } from '../../../types'
import { $fetch, reactive, useAction, useModuleT, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftScheduleSlideover' })

// Creates a schedule for an operation, or edits one: its name, how swaps work, the people per shift and the guards.
// Opened by `useShiftsActions()`; closes with the saved schedule, or `false`.
const props = defineProps<{ operationId: string, schedule?: ShiftScheduleDto }>()
const emit = defineEmits<{ close: [saved: ShiftScheduleDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()

const optionalCount = z.number().int().min(0).nullable()
const schema = z.object({
  name: z.custom<Translated>(value => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value as Record<string, string>).some(text => text?.trim())), t('admin.nameRequired', 'Give the schedule a name.')),
  swapMode: z.enum(['peer', 'approval']),
  minPerShift: optionalCount,
  maxPerShift: optionalCount,
  maxShiftsPerDay: z.number().int().min(1).max(24).nullable(),
  minRestHours: z.number().min(0).max(72).nullable(),
})
type State = z.output<typeof schema>
const state = reactive<State>({
  name: props.schedule?.name ?? '',
  swapMode: props.schedule?.swapMode ?? 'peer',
  minPerShift: props.schedule?.minPerShift ?? null,
  maxPerShift: props.schedule?.maxPerShift ?? null,
  maxShiftsPerDay: props.schedule?.guards.maxShiftsPerDay ?? null,
  minRestHours: props.schedule?.guards.minRestHours ?? null,
})

const swapModes = [
  { label: t('admin.swapModes.peer', 'Between volunteers'), value: 'peer', description: t('admin.swapModes.peerHelp', 'A swap is done as soon as the owner accepts an offer.') },
  { label: t('admin.swapModes.approval', 'With approval'), value: 'approval', description: t('admin.swapModes.approvalHelp', 'A lead of the team or staff approves each swap.') },
]

async function save(event: FormSubmitEvent<State>) {
  const { name, swapMode, minPerShift, maxPerShift, maxShiftsPerDay, minRestHours } = event.data
  const body = { name, swapMode, minPerShift, maxPerShift, guards: { maxShiftsPerDay, minRestHours } }
  const saved = await run(
    () => props.schedule
      ? $fetch<ShiftScheduleDto>(shiftsApi.admin.schedule(props.schedule.id), { method: 'PATCH', body })
      : $fetch<ShiftScheduleDto>(shiftsApi.admin.schedules, { method: 'POST', body: { operationId: props.operationId, ...body } }),
    { success: t('admin.scheduleSaved', 'Saved {name}', { name: tr(name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="shift-schedule-form"
    :title="schedule ? t('admin.editSchedule', 'Edit schedule') : t('admin.newSchedule', 'New schedule')"
    :description="t('admin.scheduleDescription', 'A schedule holds the shifts of an operation. It stays a draft until you publish it.')"
    :submit-label="schedule ? t('admin.saveSchedule', 'Save schedule') : t('admin.createSchedule', 'Create schedule')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-schedule-form"
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
        name="swapMode"
        :label="t('admin.swapMode', 'Swaps')"
      >
        <URadioGroup
          v-model="state.swapMode"
          :items="swapModes"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-4">
        <UFormField
          name="minPerShift"
          :label="t('admin.minPerShift', 'Minimum per shift')"
          :description="t('admin.minPerShiftHelp', 'Fewer shows the shift as short.')"
        >
          <UInputNumber
            v-model="state.minPerShift"
            :min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="maxPerShift"
          :label="t('admin.maxPerShift', 'Maximum per shift')"
          :description="t('admin.maxPerShiftHelp', 'Used when a shift sets no capacity. Empty is no limit.')"
        >
          <UInputNumber
            v-model="state.maxPerShift"
            :min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="maxShiftsPerDay"
          :label="t('admin.maxShiftsPerDay', 'Shifts per person per day')"
          :description="t('admin.maxShiftsPerDayHelp', 'More shows a warning; volunteers cannot swap past it.')"
        >
          <UInputNumber
            v-model="state.maxShiftsPerDay"
            :min="1"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="minRestHours"
          :label="t('admin.minRestHours', 'Rest between shifts (hours)')"
          :description="t('admin.minRestHoursHelp', 'Less shows a warning; volunteers cannot swap past it.')"
        >
          <UInputNumber
            v-model="state.minRestHours"
            :min="0"
            :step="0.5"
            class="w-full"
          />
        </UFormField>
      </div>
    </UForm>
  </FormSlideover>
</template>
