<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftStationDto, Translated } from '../../../types'
import { $fetch, computed, reactive, SHIFTS_NO_FEATURE, useAction, useModuleT, useShiftsTranslate, useShiftsVenueFeatures } from '#imports'

defineOptions({ name: 'ShiftStationSlideover' })

// A check-in station of a team on a schedule: a screen with a rotating QR code volunteers scan, optionally placed on a
// station of the operation's venue layout. Opened by `useShiftsActions()`; closes with the saved station, or `false`.
const props = defineProps<{ scheduleId: string, operationId: string, teams: ShiftsTeamOption[], station?: ShiftStationDto }>()
const emit = defineEmits<{ close: [saved: ShiftStationDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()
const venue = useShiftsVenueFeatures(() => props.operationId, { kind: 'operations.station' })

const schema = z.object({
  name: z.custom<Translated>(value => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value as Record<string, string>).some(text => text?.trim())), t('stations.nameRequired', 'Give the station a name.')),
  teamId: z.string().min(1, t('admin.teamRequired', 'Choose a team.')),
  featureId: z.string(),
})
type State = z.output<typeof schema>
const state = reactive<State>({
  name: props.station?.name ?? '',
  teamId: props.station?.teamId ?? props.teams[0]?.id ?? '',
  featureId: props.station?.featureId ?? SHIFTS_NO_FEATURE,
})
const teamOptions = computed(() => props.teams.map(team => ({ label: tr(team.name), value: team.id })))

async function save(event: FormSubmitEvent<State>) {
  const { name, teamId, featureId } = event.data
  const feature = featureId === SHIFTS_NO_FEATURE ? null : featureId
  const saved = await run(
    () => props.station
      ? $fetch<ShiftStationDto>(shiftsApi.admin.station(props.station.id), { method: 'PATCH', body: { name, featureId: feature } })
      : $fetch<ShiftStationDto>(shiftsApi.admin.stations(props.scheduleId), { method: 'POST', body: { name, teamId, featureId: feature } }),
    { success: t('stations.saved', 'Saved {name}', { name: tr(name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="shift-station-form"
    :title="station ? t('stations.editTitle', 'Edit station') : t('stations.newTitle', 'New check-in station')"
    :description="t('stations.description', 'A screen at the bar or gate with a QR code that changes every 30 seconds. Volunteers of the team scan it to check in.')"
    :submit-label="station ? t('stations.save', 'Save station') : t('stations.create', 'Add station')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-station-form"
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
        name="teamId"
        :label="t('admin.team', 'Team')"
        :description="station ? t('stations.teamFixed', 'A station stays with its team.') : t('stations.teamHelp', 'Only this team\'s volunteers check in at it.')"
        required
      >
        <USelect
          v-model="state.teamId"
          :items="teamOptions"
          :disabled="!!station"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="featureId"
        :label="t('stations.feature', 'Station on the venue layout')"
        :description="t('stations.featureHelp', 'Optional: where the station is on the venue layout.')"
      >
        <USelect
          v-model="state.featureId"
          :items="venue.items.value"
          :loading="venue.status.value === 'pending'"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
