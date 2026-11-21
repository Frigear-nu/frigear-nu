<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { shiftsApi } from '../../utils/api'
import type { ShiftCopyResultDto, ShiftScheduleDto } from '../../../types'
import { $fetch, computed, reactive, useAction, useFetch, useModuleT, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftCopySlideover' })

// Copies the roles and shifts of another schedule (of this or an earlier operation) into this one, moved by whole days.
// Opened by `useShiftsActions()`; closes with the result, or `false`.
const props = defineProps<{ schedule: ShiftScheduleDto }>()
const emit = defineEmits<{ close: [saved: ShiftCopyResultDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()

const { data: schedules } = await useFetch<ShiftScheduleDto[]>(shiftsApi.admin.schedules, { key: 'shifts:all-schedules', default: () => [] })
const options = computed(() => schedules.value.filter(item => item.id !== props.schedule.id).map(item => ({
  label: `${tr(item.name)} (${t('admin.shiftCount', '{count} shifts', { count: item.shiftCount ?? 0 })})`,
  value: item.id,
})))

const schema = z.object({
  scheduleId: z.string().min(1, t('admin.sourceRequired', 'Choose a schedule to copy.')),
  offsetDays: z.number().int().min(-3660).max(3660),
})
type State = z.output<typeof schema>
const state = reactive<State>({ scheduleId: '', offsetDays: 0 })

async function save(event: FormSubmitEvent<State>) {
  const result = await run(
    () => $fetch<ShiftCopyResultDto>(shiftsApi.admin.copyFrom(props.schedule.id), { method: 'POST', body: event.data }),
    { success: t('admin.copied', 'Copied the shifts into {name}', { name: tr(props.schedule.name) }) },
  )
  if (result) emit('close', result)
}
</script>

<template>
  <FormSlideover
    form-id="shift-copy-form"
    :title="t('admin.copyTitle', 'Copy from another schedule')"
    :description="t('admin.copyDescription', 'Copies the shift roles and shifts, not who works them, and the coverage, handover and approval, which replace this schedule\'s. Teams of another operation are matched by name.')"
    :submit-label="t('admin.copySubmit', 'Copy shifts')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-copy-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="scheduleId"
        :label="t('admin.sourceSchedule', 'Schedule')"
        required
      >
        <USelect
          v-model="state.scheduleId"
          :items="options"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="offsetDays"
        :label="t('admin.offsetDays', 'Move by days')"
        :description="t('admin.offsetDaysHelp', 'The shifts keep their local times. 364 keeps the weekday a year on.')"
      >
        <UInputNumber
          v-model="state.offsetDays"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
