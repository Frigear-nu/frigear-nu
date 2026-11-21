<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ShiftsLadder, ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftDays, shiftsRoleLabel } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import { SHIFT_SWAP_STATUS_LABELS } from '../../utils/status'
import { dayKey } from '../../utils/time'
import type { ShiftRoleDto, ShiftScheduleDto, ShiftScheduleSettings, ShiftsOperationTeamDto, ShiftSwapDto, ShiftWithAssigneesDto } from '../../../types'
import { computed, h, navigateTo, ref, resolveComponent, tableUi, useFetch, useModuleT, useRoute, useShiftsActions, useShiftsFormat, useShiftsTranslate, watch } from '#imports'

defineOptions({ name: 'ShiftsOperationTab' })

// The "Shifts" tab of the staff operation page (`extendTabs(nuxt, 'admin.operations', ...)`): the operation's schedules,
// and one schedule (`?schedule=` in the URL) with a day timeline per team, a list, its shift roles, the swaps waiting
// for approval and its settings (coverage, handover, approval), plus who is working now.
const props = defineProps<{ operation?: { id: string, slug?: string } }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const actions = useShiftsActions()
const route = useRoute()

const operationId = computed(() => props.operation?.id ?? '')
const hasOperation = computed(() => !!operationId.value)

// --- The operation's teams and their ladders, through a shifts route (`shifts:manage` is enough) ------------------------
const { data: operationTeams } = await useFetch<ShiftsOperationTeamDto[]>(() => shiftsApi.admin.teams(operationId.value || '_'), {
  immediate: hasOperation.value,
  watch: false,
  key: computed(() => `shifts:teams:${operationId.value}`),
  default: () => [],
})
const teams = computed<ShiftsTeamOption[]>(() => operationTeams.value.map(({ id, kind, name }) => ({ id, kind, name })))
const ladders = computed<ShiftsLadder[]>(() => {
  const byKind = new Map<string, ShiftsLadder>()
  for (const team of operationTeams.value) if (team.ladder) byKind.set(team.kind, { kind: team.kind, ...team.ladder })
  return [...byKind.values()]
})

// --- Schedules ---------------------------------------------------------------------------------------------------------
const { data: schedules, status: schedulesStatus, refresh: refreshSchedules } = await useFetch<ShiftScheduleDto[]>(shiftsApi.admin.schedules, {
  query: computed(() => ({ operationId: operationId.value || undefined })),
  immediate: hasOperation.value,
  key: computed(() => `shifts:schedules:${operationId.value}`),
  default: () => [],
})

const selectedId = computed(() => typeof route.query.schedule === 'string' ? route.query.schedule : '')
const selected = computed(() => schedules.value.find(schedule => schedule.id === selectedId.value))
const openSchedule = (id: string | null) => navigateTo({ query: { ...route.query, schedule: id ?? undefined } })

async function newSchedule() {
  const created = await actions.createSchedule(operationId.value)
  if (!created) return
  await refreshSchedules()
  await openSchedule(created.id)
}

const statusLabel = (status: ShiftScheduleDto['status']) => status === 'published' ? t('admin.statusPublished', 'Published') : t('admin.statusDraft', 'Draft')

const RowMenu = resolveComponent('RowMenu')
const StatusBadge = resolveComponent('StatusBadge')
const scheduleColumns = computed<TableColumn<ShiftScheduleDto>[]>(() => [
  { accessorKey: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => h('span', { class: 'text-highlighted font-medium' }, tr(row.original.name)) },
  { accessorKey: 'status', header: t('admin.status', 'Status'), cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: statusLabel(row.original.status) }) },
  { id: 'settings', header: t('admin.swaps', 'Swaps'), cell: ({ row }) => actions.settingsLabel(row.original) },
  { accessorKey: 'shiftCount', header: t('admin.shifts', 'Shifts'), cell: ({ row }) => String(row.original.shiftCount ?? 0) },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, {
      items: actions.scheduleMenu(row.original, { open: () => openSchedule(row.original.id), changed: refreshSchedules }),
      subject: tr(row.original.name),
    }),
  },
])

// --- One schedule ------------------------------------------------------------------------------------------------------
const { data: shifts, status: shiftsStatus, refresh: refreshShifts } = await useFetch<ShiftWithAssigneesDto[]>(() => shiftsApi.admin.shifts(selectedId.value || '_'), {
  immediate: !!selectedId.value,
  watch: [selectedId],
  key: computed(() => `shifts:schedule-shifts:${selectedId.value}`),
  default: () => [],
})
const { data: roles, refresh: refreshRoles } = await useFetch<ShiftRoleDto[]>(() => shiftsApi.admin.roles(selectedId.value || '_'), {
  immediate: !!selectedId.value,
  watch: [selectedId],
  key: computed(() => `shifts:schedule-roles:${selectedId.value}`),
  default: () => [],
})
const { data: swaps, refresh: refreshSwaps } = await useFetch<ShiftSwapDto[]>(shiftsApi.admin.swaps, {
  query: computed(() => ({ operationId: operationId.value || undefined, status: 'pending_approval' })),
  immediate: hasOperation.value,
  key: computed(() => `shifts:pending-swaps:${operationId.value}`),
  default: () => [],
})
const pendingSwaps = computed(() => swaps.value.filter(swap => swap.shift.scheduleId === selectedId.value))

async function refreshSchedule() {
  await Promise.all([refreshShifts(), refreshRoles(), refreshSwaps(), refreshSchedules()])
}
const context = computed(() => ({ teams: teams.value, ladders: ladders.value, roles: roles.value }))

// The settings form: a copy of the selected schedule's, saved with `saveScheduleSettings`.
const settingsState = ref<ShiftScheduleSettings>({ coverage: 'flexible', handover: 'both', approval: 'peer' })
watch(selected, (schedule) => {
  if (schedule) settingsState.value = { coverage: schedule.coverage, handover: schedule.handover, approval: schedule.approval }
}, { immediate: true })
const settingsChanged = computed(() => !!selected.value && (['coverage', 'handover', 'approval'] as const).some(key => settingsState.value[key] !== selected.value![key]))
const savingSettings = ref(false)
async function saveSettings() {
  if (!selected.value) return
  savingSettings.value = true
  try {
    if (await actions.saveScheduleSettings(selected.value, settingsState.value)) await refreshSchedules()
  }
  finally {
    savingSettings.value = false
  }
}

const view = ref<'day' | 'list' | 'roles' | 'swaps' | 'checkin' | 'settings'>('day')
const viewItems = computed(() => [
  { label: t('admin.viewDay', 'Day'), value: 'day', icon: 'i-lucide-calendar-range' },
  { label: t('admin.viewList', 'List'), value: 'list', icon: 'i-lucide-list' },
  { label: t('admin.viewRoles', 'Shift roles'), value: 'roles', icon: 'i-lucide-badge' },
  { label: t('admin.viewSwaps', 'Swaps to approve ({count})', { count: pendingSwaps.value.length }), value: 'swaps', icon: 'i-lucide-arrow-left-right' },
  { label: t('admin.viewCheckIn', 'Check-in'), value: 'checkin', icon: 'i-lucide-scan-line' },
  { label: t('admin.viewSettings', 'Settings'), value: 'settings', icon: 'i-lucide-settings' },
])

const teamFilter = ref('all')
const teamFilterOptions = computed(() => [{ label: t('admin.allTeams', 'All teams'), value: 'all' }, ...teams.value.map(team => ({ label: tr(team.name), value: team.id }))])
const visibleShifts = computed(() => teamFilter.value === 'all' ? shifts.value : shifts.value.filter(shift => shift.teamId === teamFilter.value))
const days = computed(() => shiftDays(visibleShifts.value, format.timeZone))
const day = ref('')
watch(days, (list) => {
  if (!list.includes(day.value)) day.value = list.find(item => item >= dayKey(new Date(), format.timeZone)) ?? list[0] ?? ''
}, { immediate: true })
const dayItems = computed(() => days.value.map(value => ({ label: format.day(value, { weekday: 'short', day: 'numeric', month: 'short' }), value })))
const dayShifts = computed(() => visibleShifts.value.filter(shift => dayKey(shift.startsAt, format.timeZone) === day.value))

async function open(shift: ShiftWithAssigneesDto) {
  if (await actions.openShift(shift, { roles: roles.value, minPerShift: selected.value?.minPerShift })) await refreshSchedule()
}

const roleName = (id: string | null) => {
  const role = id ? roles.value.find(item => item.id === id) : undefined
  return role ? tr(role.name) : ''
}
const teamName = (id: string) => {
  const team = teams.value.find(item => item.id === id)
  return team ? tr(team.name) : id
}
const shiftColumns = computed<TableColumn<ShiftWithAssigneesDto>[]>(() => [
  { accessorKey: 'startsAt', header: t('admin.when', 'When'), cell: ({ row }) => h('span', { class: 'tabular-nums' }, format.range(row.original.startsAt, row.original.endsAt)) },
  { accessorKey: 'teamId', header: t('admin.team', 'Team'), cell: ({ row }) => tr(row.original.teamName) },
  { accessorKey: 'shiftRoleId', header: t('admin.shiftRole', 'Shift role'), cell: ({ row }) => roleName(row.original.shiftRoleId) },
  { accessorKey: 'filled', header: t('admin.people', 'People'), cell: ({ row }) => row.original.effectiveCapacity === null ? String(row.original.filled) : `${row.original.filled}/${row.original.effectiveCapacity}` },
  { id: 'names', header: t('admin.who', 'Who'), cell: ({ row }) => row.original.assignees.map(item => item.person.name ?? '').filter(Boolean).join(', ') },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, {
      items: [
        [{ label: t('admin.openShift', 'Open shift'), icon: 'i-lucide-arrow-right', onSelect: () => open(row.original) }],
        [{ label: t('admin.deleteShift', 'Delete shift'), icon: 'i-lucide-trash-2', color: 'error', onSelect: async () => (await actions.deleteShift(row.original)) && refreshSchedule() }],
      ],
      subject: format.range(row.original.startsAt, row.original.endsAt),
    }),
  },
])
const roleColumns = computed<TableColumn<ShiftRoleDto>[]>(() => [
  { accessorKey: 'name', header: t('admin.name', 'Name'), cell: ({ row }) => h('span', { class: 'text-highlighted font-medium' }, tr(row.original.name)) },
  { accessorKey: 'teamId', header: t('admin.team', 'Team'), cell: ({ row }) => teamName(row.original.teamId) },
  {
    accessorKey: 'teamRole',
    header: t('admin.teamRole', 'Lowest team role'),
    cell: ({ row }) => row.original.teamRole
      ? shiftsRoleLabel(ladders.value, teams.value.find(team => team.id === row.original.teamId)?.kind, row.original.teamRole, tr)
      : t('admin.anyRole', 'Anybody on the team'),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.roleMenu(row.original, { ...context.value, changed: refreshSchedule }), subject: tr(row.original.name) }),
  },
])

async function bulk() {
  if (selected.value && await actions.bulkCreate(selected.value, context.value)) await refreshSchedule()
}
async function copy() {
  if (selected.value && await actions.copyFrom(selected.value)) await refreshSchedule()
}
async function publish() {
  if (selected.value && await actions.publishSchedule(selected.value)) await refreshSchedule()
}
async function edit() {
  if (selected.value && await actions.editSchedule(selected.value)) await refreshSchedule()
}
async function addRole() {
  if (selected.value && await actions.createRole(selected.value, context.value)) await refreshSchedule()
}
async function approve(swap: ShiftSwapDto) {
  if (await actions.approveSwap(swap)) await refreshSchedule()
}
async function reject(swap: ShiftSwapDto) {
  if (await actions.rejectSwap(swap)) await refreshSchedule()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="selectedId">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('admin.backToSchedules', 'Back to the schedules')"
            @click="openSchedule(null)"
          />
          <h2 class="text-highlighted truncate text-lg font-semibold">
            {{ selected ? tr(selected.name) : '' }}
          </h2>
          <StatusBadge
            v-if="selected"
            :status="selected.status"
            :label="statusLabel(selected.status)"
          />
          <UBadge
            v-if="selected"
            color="neutral"
            variant="subtle"
            :label="actions.settingsLabel(selected)"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            :label="t('admin.editSchedule', 'Edit schedule')"
            @click="edit"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-copy"
            :label="t('admin.copyShort', 'Copy shifts')"
            @click="copy"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-calendar-plus"
            :label="t('admin.bulkTitle', 'Create shifts')"
            :disabled="!teams.length"
            @click="bulk"
          />
          <UButton
            v-if="selected?.status === 'draft'"
            icon="i-lucide-send"
            :label="t('admin.publishAction', 'Publish schedule')"
            @click="publish"
          />
        </div>
      </div>

      <UAlert
        v-if="selected?.status === 'draft'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-eye-off"
        :title="t('admin.draftNote', 'Draft: volunteers do not see this schedule until you publish it.')"
      />

      <div class="flex flex-wrap items-center justify-between gap-2">
        <UTabs
          v-model="view"
          :items="viewItems"
          :content="false"
          variant="link"
        />
        <USelect
          v-if="view === 'day' || view === 'list'"
          v-model="teamFilter"
          :items="teamFilterOptions"
          class="w-48"
        />
      </div>

      <SectionCard
        v-if="view === 'day'"
        flush
        :loading="shiftsStatus === 'pending' && !shifts.length"
      >
        <UEmpty
          v-if="!days.length"
          icon="i-lucide-calendar-plus"
          :title="t('admin.noShifts', 'No shifts yet')"
          :description="t('admin.noShiftsDescription', 'Create shifts for a team over a range of days, or copy them from another schedule.')"
          :actions="[{ label: t('admin.bulkTitle', 'Create shifts'), icon: 'i-lucide-calendar-plus', onClick: bulk }]"
        />
        <template v-else>
          <div class="border-default flex gap-1 overflow-x-auto border-b p-2">
            <UButton
              v-for="item in dayItems"
              :key="item.value"
              size="sm"
              :color="item.value === day ? 'primary' : 'neutral'"
              :variant="item.value === day ? 'solid' : 'ghost'"
              :label="item.label"
              @click="day = item.value"
            />
          </div>
          <ShiftDayView
            :shifts="dayShifts"
            :day="day"
            :teams="teams"
            :time-zone="format.timeZone"
            :min-per-shift="selected?.minPerShift"
            @open="open"
          />
        </template>
      </SectionCard>

      <TableCard
        v-else-if="view === 'list'"
        :title="t('admin.shifts', 'Shifts')"
        :loading="shiftsStatus === 'pending' && !shifts.length"
      >
        <UTable
          :data="visibleShifts"
          :columns="shiftColumns"
          :ui="tableUi()"
          @select="(_event: Event, row: { original: ShiftWithAssigneesDto }) => open(row.original)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-calendar-plus"
              :title="t('admin.noShifts', 'No shifts yet')"
              :actions="[{ label: t('admin.bulkTitle', 'Create shifts'), icon: 'i-lucide-calendar-plus', onClick: bulk }]"
            />
          </template>
        </UTable>
      </TableCard>

      <TableCard
        v-else-if="view === 'roles'"
        :title="t('admin.viewRoles', 'Shift roles')"
        :description="t('admin.rolesDescription', 'Roles such as BA or bartender, with the lowest team role that may hold them.')"
      >
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            :label="t('admin.createRole', 'Add shift role')"
            :disabled="!teams.length"
            @click="addRole"
          />
        </template>
        <UTable
          :data="roles"
          :columns="roleColumns"
          :ui="tableUi()"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-badge"
              :title="t('admin.noRoles', 'No shift roles')"
              :description="t('admin.noRolesDescription', 'Without roles anybody on the team can hold any shift.')"
              :actions="[{ label: t('admin.createRole', 'Add shift role'), icon: 'i-lucide-plus', onClick: addRole }]"
            />
          </template>
        </UTable>
      </TableCard>

      <ShiftCheckInCard
        v-else-if="view === 'checkin' && selected"
        :schedule="selected"
        :teams="teams"
        @changed="refreshSchedules"
      />

      <SectionCard
        v-else-if="view === 'settings'"
        :title="t('admin.settingsTitle', 'How shifts change hands')"
        :description="t('admin.settingsDescription', 'Changes apply to swaps opened before too: accepting or approving one checks the settings of that moment.')"
      >
        <UForm
          id="shift-schedule-settings-form"
          :state="settingsState"
          class="divide-default divide-y"
          @submit="saveSettings"
        >
          <ShiftScheduleSettingsFields v-model="settingsState" />
        </UForm>
        <template #footer>
          <div class="flex justify-end">
            <UButton
              type="submit"
              form="shift-schedule-settings-form"
              :loading="savingSettings"
              :disabled="!settingsChanged"
              :label="t('admin.saveSettings', 'Save settings')"
            />
          </div>
        </template>
      </SectionCard>

      <SectionCard
        v-else
        :title="t('admin.viewSwapsTitle', 'Swaps to approve')"
        :description="selected?.approval === 'lead' ? t('admin.swapsApprovalHelp', 'Swaps the owner accepted wait here for a lead of the team or staff.') : t('admin.swapsPeerHelp', 'This schedule swaps between volunteers: nothing waits for approval.')"
      >
        <p
          v-if="!pendingSwaps.length"
          class="text-muted text-sm"
        >
          {{ t('admin.noPendingSwaps', 'No swaps wait for approval.') }}
        </p>
        <ul
          v-else
          class="divide-default divide-y"
        >
          <li
            v-for="swap in pendingSwaps"
            :key="swap.id"
            class="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <div class="flex flex-col text-sm">
              <span class="text-highlighted font-medium">{{ tr(swap.shift.teamName) }} · {{ format.range(swap.shift.startsAt, swap.shift.endsAt) }}</span>
              <span class="text-muted">
                {{ actions.swapSummary(swap) }}
              </span>
              <StatusBadge
                class="self-start"
                :status="swap.status"
                :label="t(`swapStatuses.${swap.status}`, SHIFT_SWAP_STATUS_LABELS[swap.status])"
              />
            </div>
            <div class="flex items-center gap-2">
              <span
                v-if="!actions.swapAllowed(swap)"
                class="text-muted text-sm"
              >
                {{ t('swaps.noLongerAllowed', 'No longer allowed by the schedule\'s settings: reject it.') }}
              </span>
              <UButton
                color="neutral"
                variant="outline"
                :label="t('swaps.rejectAction', 'Reject swap')"
                @click="reject(swap)"
              />
              <UButton
                v-if="actions.swapAllowed(swap)"
                :label="t('swaps.approveAction', 'Approve swap')"
                @click="approve(swap)"
              />
            </div>
          </li>
        </ul>
      </SectionCard>
    </template>

    <template v-else>
      <TableCard
        :title="t('admin.schedules', 'Schedules')"
        :description="t('admin.schedulesDescription', 'Each schedule holds shifts for the operation\'s teams. Publish it when it is ready.')"
        :loading="schedulesStatus === 'pending' && !schedules.length"
      >
        <template #actions>
          <UButton
            icon="i-lucide-plus"
            :label="t('admin.newSchedule', 'New schedule')"
            :disabled="!hasOperation"
            @click="newSchedule"
          />
        </template>
        <UTable
          :data="schedules"
          :columns="scheduleColumns"
          :ui="tableUi()"
          @select="(_event: Event, row: { original: ShiftScheduleDto }) => openSchedule(row.original.id)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-calendar-clock"
              :title="t('admin.noSchedules', 'No schedules yet')"
              :description="t('admin.noSchedulesDescription', 'Create a schedule, then add shifts for the teams.')"
              :actions="[{ label: t('admin.newSchedule', 'New schedule'), icon: 'i-lucide-plus', onClick: newSchedule }]"
            />
          </template>
        </UTable>
      </TableCard>
      <ShiftNowCard
        v-if="hasOperation"
        :operation-id="operationId"
      />
      <ShiftPerksCard
        v-if="hasOperation"
        :operation-id="operationId"
        :teams="teams"
      />
      <ShiftBroadcastsCard
        v-if="hasOperation"
        :operation-id="operationId"
        :teams="teams"
        :ladders="ladders"
      />
    </template>
  </div>
</template>
