<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { SHIFT_ASSIGNMENT_STATUS_LABELS } from '../../utils/status'
import { dayKey } from '../../utils/time'
import type { ShiftAssigneeDto, ShiftsLedTeamDto, ShiftSwapDto, ShiftWithAssigneesDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, useAction, useAuthPages, useFetch, useHead, useModuleT, useRoute, useShiftsActions, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsLeadPage' })

// A team lead's page: the team's upcoming shifts with who works them (attended and no-show marks), the swaps waiting for
// approval, and the way to the check-in scanner. Only leads of the team (and staff) read it; the server decides.
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
const { data: led } = await useFetch<ShiftsLedTeamDto[]>(shiftsApi.me.leads, { key: 'shifts:leads', default: () => [] })
const team = computed(() => led.value.find(item => item.teamId === teamId.value))

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
  if (done) await refresh()
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
                <div class="flex gap-2">
                  <UButton
                    color="neutral"
                    variant="outline"
                    :label="t('swaps.rejectAction', 'Reject swap')"
                    @click="reject(swap)"
                  />
                  <UButton
                    :label="t('swaps.approveAction', 'Approve swap')"
                    @click="approve(swap)"
                  />
                </div>
              </li>
            </ul>
          </SectionCard>

          <UEmpty
            v-if="!days.length"
            icon="i-lucide-calendar-clock"
            :title="t('lead.empty', 'No upcoming shifts for the team')"
          />
          <SectionCard
            v-for="group in days"
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
