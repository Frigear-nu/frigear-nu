<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { MapLocation } from '@frigear-nu/maps/utils'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import { DEFAULT_CHECK_IN_RADIUS } from '../../utils/checkin'
import type { ShiftCheckInMode, ShiftCheckInTeamSettings, ShiftScheduleDto, ShiftStationDto } from '../../../types'
import { $fetch, computed, h, ref, resolveComponent, tableUi, useAction, useFetch, useModuleT, useShiftsActions, useShiftsTranslate, watch } from '#imports'

defineOptions({ name: 'ShiftCheckInCard' })

// The "Check-in" view of a schedule in the Shifts tab: how volunteers check in (the modes, the place of `location`
// mode, overrides per team), auto no-shows, and the schedule's check-in stations.
const props = defineProps<{ schedule: ShiftScheduleDto, teams: ShiftsTeamOption[] }>()
const emit = defineEmits<{ changed: [] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const actions = useShiftsActions()
const { busy, run } = useAction()

type SelfMode = Exclude<ShiftCheckInMode, 'lead'>
type TeamOverride = { teamId: string, modes: SelfMode[], location: MapLocation | null }
const selfModes = (modes: ShiftCheckInMode[] | undefined) => (modes ?? []).filter((mode): mode is SelfMode => mode !== 'lead')

// The form: a copy of the schedule's settings, saved with one PATCH.
const modes = ref<SelfMode[]>([])
const location = ref<MapLocation | null>(null)
const autoNoShow = ref(false)
const autoNoShowMinutes = ref(30)
const overrides = ref<TeamOverride[]>([])
function reset() {
  const checkIn = props.schedule.checkIn
  modes.value = selfModes(checkIn.modes)
  location.value = checkIn.location ?? null
  autoNoShow.value = props.schedule.autoNoShow
  autoNoShowMinutes.value = props.schedule.autoNoShowMinutes
  overrides.value = Object.entries(checkIn.teams ?? {}).map(([teamId, team]) => ({ teamId, modes: selfModes(team.modes ?? checkIn.modes), location: team.location ?? null }))
}
watch(() => props.schedule, reset, { immediate: true })

// Without a station key on the server (`NUXT_SHIFTS_STATION_KEY`) station check-in cannot work: the mode cannot be
// turned on, and one already on can only be turned off.
const stationReady = computed(() => props.schedule.stationKeyConfigured)
const stationInUse = computed(() => modes.value.includes('station') || overrides.value.some(item => item.modes.includes('station')))
const modeItemsFor = (selected: SelfMode[]) => [
  {
    label: t('checkIn.modes.station', 'Station'),
    description: stationReady.value
      ? t('checkIn.modes.stationHelp', 'Volunteers scan the rotating QR code of a station of their team.')
      : t('checkIn.modes.stationNeedsKey', 'Needs a station key on the server (NUXT_SHIFTS_STATION_KEY).'),
    value: 'station',
    disabled: !stationReady.value && !selected.includes('station'),
  },
  { label: t('checkIn.modes.location', 'Location'), description: t('checkIn.modes.locationHelp', 'Volunteers tap "I\'m here" and the app sends their position. A determined person can fake it.'), value: 'location' },
  { label: t('checkIn.modes.daily', 'Once a day'), description: t('checkIn.modes.dailyHelp', 'The first check-in of the day also checks in the person\'s other shifts that day whose check-in is open.'), value: 'daily' },
]
const modeItems = computed(() => modeItemsFor(modes.value))
const teamName = (id: string) => {
  const team = props.teams.find(item => item.id === id)
  return team ? tr(team.name) : id
}
const addableTeams = computed(() => props.teams.filter(team => !overrides.value.some(item => item.teamId === team.id)).map(team => ({ label: tr(team.name), value: team.id })))
const teamToAdd = ref<string | undefined>(undefined)
function addOverride(teamId: string | undefined) {
  if (!teamId) return
  overrides.value.push({ teamId, modes: [...modes.value], location: location.value })
  teamToAdd.value = undefined
}

async function save() {
  const teams: Record<string, ShiftCheckInTeamSettings> = Object.fromEntries(overrides.value.map(item => [item.teamId, { modes: [...item.modes, 'lead'], ...(item.location ? { location: item.location } : {}) }]))
  const body = {
    checkIn: { modes: [...modes.value, 'lead'], location: location.value, ...(overrides.value.length ? { teams } : {}) },
    autoNoShow: autoNoShow.value,
    autoNoShowMinutes: autoNoShowMinutes.value,
  }
  const saved = await run(
    () => $fetch<ShiftScheduleDto>(shiftsApi.admin.schedule(props.schedule.id), { method: 'PATCH', body }),
    { success: t('checkIn.saved', 'Saved the check-in of {name}', { name: tr(props.schedule.name) }), error: t('checkIn.saveFailed', 'Could not save the check-in settings') },
  )
  if (saved) emit('changed')
}

// --- Stations ----------------------------------------------------------------------------------------------------------
const { data: stations, status, refresh } = await useFetch<ShiftStationDto[]>(() => shiftsApi.admin.stations(props.schedule.id), {
  key: computed(() => `shifts:stations:${props.schedule.id}`),
  default: () => [],
})
async function addStation() {
  if (await actions.createStation(props.schedule, props.teams)) await refresh()
}
const RowMenu = resolveComponent('RowMenu')
const columns = computed<TableColumn<ShiftStationDto>[]>(() => [
  { accessorKey: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => h('span', { class: 'text-highlighted font-medium' }, tr(row.original.name)) },
  { accessorKey: 'teamId', header: t('admin.team', 'Team'), cell: ({ row }) => teamName(row.original.teamId) },
  { accessorKey: 'featureId', header: t('stations.feature', 'Station on the venue layout'), cell: ({ row }) => row.original.featureId ?? '' },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.stationMenu(row.original, { schedule: props.schedule, teams: props.teams, changed: refresh }), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert
      v-if="!stationReady"
      icon="i-lucide-key-round"
      :color="stationInUse ? 'warning' : 'neutral'"
      variant="subtle"
      :title="t('checkIn.stationKeyMissing', 'Station check-in needs a station key')"
      :description="stationInUse
        ? t('checkIn.stationKeyMissingInUse', 'Station check-in is on, but the server has no NUXT_SHIFTS_STATION_KEY: volunteers cannot check in by station and station screens do not open. Set the key, or turn the mode off. The other modes work.')
        : t('checkIn.stationKeyMissingHint', 'Set NUXT_SHIFTS_STATION_KEY on the server to use station check-in and station screens. The other modes work without it.')"
    />
    <SectionCard
      :title="t('checkIn.title', 'How volunteers check in')"
      :description="t('checkIn.description', 'Any mode that is on is enough. A lead can always scan a volunteer\'s pass.')"
    >
      <div class="divide-default divide-y">
        <FormRow
          name="modes"
          :label="t('checkIn.modesLabel', 'Check-in modes')"
          :description="t('checkIn.modesHint', 'Besides a lead scanning the pass.')"
        >
          <UCheckboxGroup
            v-model="modes"
            :items="modeItems"
          />
        </FormRow>
        <FormRow
          v-if="modes.includes('location')"
          name="location"
          :label="t('checkIn.location', 'Check-in place')"
          :description="t('checkIn.locationHint', 'A point and radius ({radius} m unless you set one), or an area. The phone\'s accuracy must be within the radius.', { radius: DEFAULT_CHECK_IN_RADIUS })"
        >
          <MapLocationField
            v-model="location"
            :modes="['radius', 'area']"
            :default-radius="DEFAULT_CHECK_IN_RADIUS"
            height="16rem"
          />
        </FormRow>
        <FormRow
          name="autoNoShow"
          :label="t('checkIn.autoNoShow', 'Automatic no-shows')"
          :description="t('checkIn.autoNoShowHint', 'Mark people who have not checked in this long after the start as no-shows. Their leads get it in a digest.')"
        >
          <div class="flex flex-wrap items-center gap-3">
            <USwitch
              v-model="autoNoShow"
              :label="t('checkIn.autoNoShowOn', 'On')"
            />
            <UInputNumber
              v-model="autoNoShowMinutes"
              :min="0"
              :max="1440"
              :disabled="!autoNoShow"
              class="w-32"
              :aria-label="t('checkIn.autoNoShowMinutes', 'Minutes after the start')"
            />
            <span class="text-muted text-sm">{{ t('checkIn.minutesAfterStart', 'minutes after the start') }}</span>
          </div>
        </FormRow>
        <FormRow
          name="teams"
          :label="t('checkIn.overrides', 'Per team')"
          :description="t('checkIn.overridesHint', 'A team can check in differently, e.g. at its own bar.')"
        >
          <div class="flex flex-col gap-4">
            <div
              v-for="(item, index) in overrides"
              :key="item.teamId"
              class="border-default flex flex-col gap-2 rounded-md border p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-highlighted text-sm font-semibold">{{ teamName(item.teamId) }}</span>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="t('checkIn.removeOverride', 'Remove the override of {team}', { team: teamName(item.teamId) })"
                  @click="overrides.splice(index, 1)"
                />
              </div>
              <UCheckboxGroup
                v-model="item.modes"
                :items="modeItemsFor(item.modes)"
                orientation="horizontal"
              />
              <MapLocationField
                v-if="item.modes.includes('location')"
                v-model="item.location"
                :modes="['radius', 'area']"
                :default-radius="DEFAULT_CHECK_IN_RADIUS"
                height="12rem"
              />
            </div>
            <USelect
              v-if="addableTeams.length"
              v-model="teamToAdd"
              :items="addableTeams"
              :placeholder="t('checkIn.addOverride', 'Add a team override')"
              class="w-60"
              @update:model-value="addOverride"
            />
          </div>
        </FormRow>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :label="t('checkIn.reset', 'Discard changes')"
            @click="reset"
          />
          <UButton
            :loading="busy"
            :label="t('checkIn.save', 'Save check-in settings')"
            @click="save"
          />
        </div>
      </template>
    </SectionCard>

    <TableCard
      :title="t('stations.title', 'Check-in stations')"
      :description="t('stations.cardDescription', 'Screens with a QR code that changes every 30 seconds. Open one on a tablet at the bar; leads of the team can open it too.')"
      :loading="status === 'pending' && !stations.length"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('stations.create', 'Add station')"
          :disabled="!teams.length"
          @click="addStation"
        />
      </template>
      <UTable
        :data="stations"
        :columns="columns"
        :ui="tableUi()"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-qr-code"
            :title="t('stations.empty', 'No stations yet')"
            :description="t('stations.emptyDescription', 'Add one per bar or gate when volunteers check in by station.')"
            :actions="[{ label: t('stations.create', 'Add station'), icon: 'i-lucide-plus', onClick: addStation }]"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
