<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import { daysBetween } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftDto, ShiftRoleDto } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useRuntimeConfig, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftBulkSlideover' })

// Creates many shifts at once: every slot on every day of a range, for one team. Times are the local times of the
// module's time zone. Opened by `useShiftsActions()`; closes with the created shifts, or `false`.
const props = defineProps<{ scheduleId: string, teams: ShiftsTeamOption[], roles: ShiftRoleDto[] }>()
const emit = defineEmits<{ close: [saved: ShiftDto[] | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()
const timeZone = useRuntimeConfig().public.shifts?.timeZone ?? 'UTC'

const NONE = '__none__'
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, t('admin.clockInvalid', 'Use HH:mm.'))
const schema = z.object({
  teamId: z.string().min(1, t('admin.teamRequired', 'Choose a team.')),
  from: z.string().min(1, t('admin.fromRequired', 'Pick the first day.')),
  to: z.string().min(1, t('admin.toRequired', 'Pick the last day.')),
  slots: z.array(z.object({ start: clock, end: clock })).min(1),
  capacity: z.number().int().min(0).nullable(),
  shiftRoleId: z.string(),
}).refine(value => value.to >= value.from, { message: t('admin.rangeInvalid', 'The last day must be on or after the first.'), path: ['to'] })
type State = z.output<typeof schema>
const state = reactive<State>({ teamId: props.teams[0]?.id ?? '', from: '', to: '', slots: [{ start: '10:00', end: '16:00' }], capacity: null, shiftRoleId: NONE })

const teamOptions = computed(() => props.teams.map(team => ({ label: tr(team.name), value: team.id })))
const roleOptions = computed(() => [
  { label: t('admin.noRole', 'No role'), value: NONE },
  ...props.roles.filter(role => role.teamId === state.teamId).map(role => ({ label: tr(role.name), value: role.id })),
])
const days = computed(() => (state.from && state.to ? daysBetween(state.from, state.to) : []))
const total = computed(() => days.value.length * state.slots.length)

function addSlot() {
  const last = state.slots.at(-1)
  state.slots.push({ start: last?.end ?? '16:00', end: last?.end && last.end < '18:00' ? '22:00' : '02:00' })
}

async function save(event: FormSubmitEvent<State>) {
  const { teamId, slots, capacity, shiftRoleId } = event.data
  const saved = await run(
    () => $fetch<ShiftDto[]>(shiftsApi.admin.bulk(props.scheduleId), {
      method: 'POST',
      body: { teamId, days: days.value, slots, capacity, shiftRoleId: shiftRoleId === NONE ? null : shiftRoleId },
    }),
    { success: t('admin.bulkCreated', 'Created {count} shifts', { count: total.value }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="shift-bulk-form"
    :title="t('admin.bulkTitle', 'Create shifts')"
    :description="t('admin.bulkDescription', 'Every time slot on every day, for one team. Times are local times in {zone}; a slot that ends before it starts ends the next day.', { zone: timeZone })"
    :submit-label="t('admin.bulkSubmit', 'Create {count} shifts', { count: total })"
    :loading="busy"
    :disabled="!total"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-bulk-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="teamId"
        :label="t('admin.team', 'Team')"
        required
      >
        <USelect
          v-model="state.teamId"
          :items="teamOptions"
          class="w-full"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-4">
        <UFormField
          name="from"
          :label="t('admin.firstDay', 'First day')"
          required
        >
          <UInput
            v-model="state.from"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="to"
          :label="t('admin.lastDay', 'Last day')"
          required
        >
          <UInput
            v-model="state.to"
            type="date"
            class="w-full"
          />
        </UFormField>
      </div>
      <UFormField
        name="slots"
        :label="t('admin.slots', 'Time slots')"
      >
        <div class="flex flex-col gap-2">
          <div
            v-for="(slot, index) in state.slots"
            :key="index"
            class="flex items-center gap-2"
          >
            <UInput
              v-model="slot.start"
              type="time"
              :aria-label="t('admin.slotStart', 'Starts')"
            />
            <span class="text-muted">–</span>
            <UInput
              v-model="slot.end"
              type="time"
              :aria-label="t('admin.slotEnd', 'Ends')"
            />
            <UButton
              v-if="state.slots.length > 1"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.removeSlot', 'Remove time slot')"
              @click="state.slots.splice(index, 1)"
            />
          </div>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            class="self-start"
            :label="t('admin.addSlot', 'Add time slot')"
            @click="addSlot"
          />
        </div>
      </UFormField>
      <div class="grid grid-cols-2 gap-4">
        <UFormField
          name="capacity"
          :label="t('admin.capacity', 'Capacity')"
          :description="t('admin.capacityHelp', 'Empty uses the schedule\'s maximum.')"
        >
          <UInputNumber
            v-model="state.capacity"
            :min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          name="shiftRoleId"
          :label="t('admin.shiftRole', 'Shift role')"
        >
          <USelect
            v-model="state.shiftRoleId"
            :items="roleOptions"
            class="w-full"
          />
        </UFormField>
      </div>
    </UForm>
  </FormSlideover>
</template>
