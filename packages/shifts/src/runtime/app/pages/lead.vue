<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { SHIFT_ASSIGNMENT_STATUS_LABELS } from '../../utils/status'
import { dayKey } from '@frigear-nu/module-kit/time'
import type { ShiftAssigneeDto, ShiftExceptionDto, ShiftExceptionKind, ShiftsLedTeamDto, ShiftStationDto, ShiftSwapDto, ShiftWithAssigneesDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, ref, useAction, useAuthPages, useCachedFetch, useFetch, useHead, useModuleT, useRoute, useShiftsActions, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsLeadPage' })

// A team lead's page. It opens on the exceptions of the team's recent shifts (no-shows, late check-ins, people not
// checked in after the start, no-shows whose perk was claimed); the team's upcoming shifts with who works them
// (attended and no-show marks) are one tab away. Also the swaps waiting for approval, the team's check-in stations and
// the way to the scanner. Only leads of the team (and staff) read it; the server decides.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()
const actions = useShiftsActions()
const { run } = useAction()
const route = useRoute()
const teamId = computed(() => String(route.params.teamId ?? ''))

// From the start of today in the operation's time zone, fixed for the page (the server and the browser ask the same).
const from = `${dayKey(new Date(), format.timeZone)}T00:00:00.000Z`
const { data: shifts, error, refresh } = await useFetch<ShiftWithAssigneesDto[]>(() => shiftsApi.teams.shifts(teamId.value), {
  query: { from },
  key: computed(() => `shifts:lead:${teamId.value}`),
  default: () => [],
})
if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}
const { data: swaps, refresh: refreshSwaps } = await useFetch<ShiftSwapDto[]>(() => shiftsApi.teams.swaps(teamId.value), {
  query: { status: 'pending_approval' },
  key: computed(() => `shifts:lead-swaps:${teamId.value}`),
  default: () => [],
})
const { data: exceptions, refresh: refreshExceptions } = await useFetch<ShiftExceptionDto[]>(() => shiftsApi.teams.exceptions(teamId.value), {
  key: computed(() => `shifts:lead-exceptions:${teamId.value}`),
  default: () => [],
})
const { data: stations } = await useFetch<ShiftStationDto[]>(() => shiftsApi.teams.stations(teamId.value), {
  key: computed(() => `shifts:lead-stations:${teamId.value}`),
  default: () => [],
})
const view = ref<'exceptions' | 'shifts'>('exceptions')
const viewItems = computed(() => [
  { label: t('lead.viewExceptions', 'Exceptions ({count})', { count: exceptions.value.length }), value: 'exceptions', icon: 'i-lucide-triangle-alert' },
  { label: t('lead.viewShifts', 'All shifts'), value: 'shifts', icon: 'i-lucide-list' },
])
const exceptionLabel = (item: ShiftExceptionDto) => ({
  no_show: t('exceptions.no_show', 'No-show'),
  late: t('exceptions.late', 'Late by {minutes} min', { minutes: item.lateMinutes ?? 0 }),
  not_checked_in: t('exceptions.not_checked_in', 'Not checked in'),
  claimed_no_show: t('exceptions.claimed_no_show', 'No-show, perk claimed'),
} satisfies Record<ShiftExceptionKind, string>)[item.kind]
const exceptionColor = (kind: ShiftExceptionKind) => kind === 'late' ? 'warning' : kind === 'not_checked_in' ? 'info' : 'error'
// The same key as the My shifts tab (`useCachedFetch`, so both share one entry).
const { data: led } = await useCachedFetch<ShiftsLedTeamDto[]>(shiftsApi.me.leads, { key: 'shifts:leads', ttl: 0 })
const team = computed(() => (led.value ?? []).find(item => item.teamId === teamId.value))

const days = computed(() => {
  const byDay = new Map<string, ShiftWithAssigneesDto[]>()
  for (const shift of shifts.value) {
    const key = dayKey(shift.startsAt, format.timeZone)
    byDay.set(key, [...(byDay.get(key) ?? []), shift])
  }
  return [...byDay.entries()].map(([day, items]) => ({ day, items }))
})

const nameOf = (person: { name: string | null, userId: number }) => person.name ?? `#${person.userId}`
const statusLabel = (status: ShiftAssigneeDto['status']) => t(`statuses.${status}`, SHIFT_ASSIGNMENT_STATUS_LABELS[status])

async function mark(assignee: ShiftAssigneeDto, to: 'attended' | 'no_show') {
  const done = await run(
    () => $fetch(to === 'attended' ? shiftsApi.attended(assignee.id) : shiftsApi.noShow(assignee.id), { method: 'POST' }).then(() => true),
    { success: t('admin.marked', 'Marked {name} {status}', { name: nameOf(assignee.person), status: statusLabel(to).toLowerCase() }), error: t('lead.markFailed', 'Could not mark attendance') },
  )
  if (done) await Promise.all([refresh(), refreshExceptions()])
}

async function approve(swap: ShiftSwapDto) {
  if (await actions.approveSwap(swap)) await Promise.all([refresh(), refreshSwaps()])
}
async function reject(swap: ShiftSwapDto) {
  if (await actions.rejectSwap(swap)) await Promise.all([refresh(), refreshSwaps()])
}

useHead({ title: () => t('lead.title', 'Lead {team}', { team: team.value ? tr(team.value.teamName) : '' }) })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="team ? tr(team.teamName) : t('lead.titleFallback', 'Your team')"
        :description="team ? tr(team.operationName) : t('lead.description', 'Your team\'s shifts, attendance and swaps.')"
      >
        <template #links>
          <UButton
            icon="i-lucide-megaphone"
            color="neutral"
            variant="outline"
            :label="t('broadcast.leadAction', 'Message team')"
            @click="actions.broadcastToTeam(teamId, team ? tr(team.teamName) : '')"
          />
          <UButton
            :to="links.checkIn(teamId)"
            icon="i-lucide-scan-line"
            :label="t('lead.scanner', 'Open the check-in scanner')"
          />
        </template>
      </UPageHeader>
      <UPageBody class="max-w-3xl">
        <UEmpty
          v-if="error && error.statusCode !== 401"
          icon="i-lucide-circle-alert"
          :title="error.statusCode === 403 ? t('lead.forbidden', 'You do not lead this team') : t('lead.loadFailed', 'The team could not be loaded')"
          :description="error.statusCode === 403 ? undefined : errorMessage(error, '')"
          :actions="[{ label: t('shift.back', 'My shifts'), to: links.shifts(), color: 'neutral', variant: 'outline' }]"
        />
        <div
          v-else
          class="flex flex-col gap-4"
        >
          <SectionCard
            v-if="swaps.length"
            :title="t('admin.viewSwapsTitle', 'Swaps to approve')"
            icon="i-lucide-arrow-left-right"
          >
            <ul class="divide-default divide-y">
              <li
                v-for="swap in swaps"
                :key="swap.id"
                class="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div class="flex flex-col text-sm">
                  <span class="text-highlighted font-medium">{{ tr(swap.shift.teamName) }} · {{ format.range(swap.shift.startsAt, swap.shift.endsAt) }}</span>
                  <span class="text-muted">
                    {{ actions.swapSummary(swap) }}
                  </span>
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

          <SectionCard
            v-if="stations.length"
            :title="t('lead.stations', 'Check-in stations')"
            icon="i-lucide-qr-code"
          >
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="station in stations"
                :key="station.id"
                :to="links.station(station.id)"
                icon="i-lucide-monitor"
                color="neutral"
                variant="outline"
                :label="t('lead.openStation', 'Open {name}', { name: tr(station.name) })"
              />
            </div>
          </SectionCard>

          <UTabs
            v-model="view"
            :items="viewItems"
            :content="false"
            variant="link"
          />

          <template v-if="view === 'exceptions'">
            <UEmpty
              v-if="!exceptions.length"
              icon="i-lucide-check-circle"
              :title="t('lead.noExceptions', 'Nothing to look at')"
              :description="t('lead.noExceptionsDescription', 'Everybody on the team\'s shifts of the last day checked in on time.')"
            />
            <SectionCard
              v-else
              :title="t('lead.exceptionsTitle', 'Exceptions')"
              :description="t('lead.exceptionsDescription', 'No-shows, late check-ins and people not checked in on the shifts of the last day.')"
            >
              <ul class="divide-default divide-y">
                <li
                  v-for="item in exceptions"
                  :key="`${item.kind}:${item.assignment.id}`"
                  class="flex flex-wrap items-center justify-between gap-2 py-1.5"
                >
                  <div class="flex flex-col gap-0.5">
                    <TableIdentity
                      :title="nameOf(item.assignment.person)"
                      :description="`${format.day(dayKey(item.shift.startsAt, format.timeZone))} · ${format.time(item.shift.startsAt)}–${format.time(item.shift.endsAt)}`"
                      :avatar="{ src: item.assignment.person.avatar ?? undefined, alt: nameOf(item.assignment.person) }"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <UBadge
                      :color="exceptionColor(item.kind)"
                      variant="subtle"
                      :label="exceptionLabel(item)"
                    />
                    <UButton
                      v-if="item.assignment.status !== 'attended'"
                      size="xs"
                      color="neutral"
                      variant="outline"
                      :label="t('admin.markAttended', 'Mark attended')"
                      @click="mark(item.assignment, 'attended')"
                    />
                    <UButton
                      v-if="item.assignment.status === 'assigned'"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :label="t('admin.markNoShow', 'Mark no-show')"
                      @click="mark(item.assignment, 'no_show')"
                    />
                  </div>
                </li>
              </ul>
            </SectionCard>
          </template>

          <UEmpty
            v-if="view === 'shifts' && !days.length"
            icon="i-lucide-calendar-clock"
            :title="t('lead.empty', 'No upcoming shifts for the team')"
          />
          <SectionCard
            v-for="group in (view === 'shifts' ? days : [])"
            :key="group.day"
            :title="format.day(group.day)"
          >
            <div class="flex flex-col gap-4">
              <div
                v-for="shift in group.items"
                :key="shift.id"
                class="flex flex-col gap-1"
              >
                <span class="text-highlighted text-sm font-semibold tabular-nums">
                  {{ format.time(shift.startsAt) }}–{{ format.time(shift.endsAt) }}
                  <span class="text-muted font-normal">· {{ shift.effectiveCapacity === null ? shift.filled : `${shift.filled}/${shift.effectiveCapacity}` }}</span>
                </span>
                <p
                  v-if="!shift.assignees.length"
                  class="text-muted text-sm"
                >
                  {{ t('admin.nobodyYet', 'Nobody yet.') }}
                </p>
                <ul
                  v-else
                  class="divide-default divide-y"
                >
                  <li
                    v-for="assignee in shift.assignees"
                    :key="assignee.id"
                    class="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <TableIdentity
                      :title="nameOf(assignee.person)"
                      :avatar="{ src: assignee.person.avatar ?? undefined, alt: nameOf(assignee.person) }"
                    />
                    <div class="flex items-center gap-2">
                      <StatusBadge
                        :status="assignee.status"
                        :label="statusLabel(assignee.status)"
                        :colors="{ assigned: 'info', attended: 'success', no_show: 'error' }"
                      />
                      <UButton
                        v-if="assignee.status !== 'attended'"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        :label="t('admin.markAttended', 'Mark attended')"
                        @click="mark(assignee, 'attended')"
                      />
                      <UButton
                        v-if="assignee.status !== 'no_show'"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :label="t('admin.markNoShow', 'Mark no-show')"
                        @click="mark(assignee, 'no_show')"
                      />
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </SectionCard>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
