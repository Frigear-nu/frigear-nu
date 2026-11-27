<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { SHIFT_ASSIGNMENT_STATUS_LABELS, SHIFT_SWAP_STATUS_LABELS } from '../../utils/status'
import { dayKey } from '@frigear-nu/module-kit/time'
import type { MyShiftDto, ShiftsLedTeamDto } from '../../../types'
import { computed, errorMessage, navigateTo, ref, shallowRef, useAuthPages, useCachedFetch, useModuleT, useRoute, useShiftsActions, useShiftsFormat, useShiftsLinks, useShiftsTranslate, watch } from '#imports'

defineOptions({ name: 'ShiftsHomeShiftsTab' })

// `standalone`: on the page of its own, which links to the swaps (on the crew home they are the next tab).
defineProps<{ standalone?: boolean }>()

// My shifts: a month calendar marking the days I work, and the list grouped by day (upcoming first, past ones on
// request), with the lead pages of the teams I lead, the calendar feed and the swaps above. The My shifts tab of the
// crew home (`crew.dashboard`), and the body of the my-shifts page where there is one.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()
const actions = useShiftsActions()
const route = useRoute()

// The last responses show at once (also after a restart of the mobile app); every mount asks again in the background.
const { data: fetched, error, loading, refresh } = useCachedFetch<MyShiftDto[]>(shiftsApi.me.shifts, { key: 'shifts:me', ttl: 0, lazy: true })
const data = computed(() => fetched.value ?? [])
// The teams I lead get a link to their lead page.
const { data: ledTeams } = useCachedFetch<ShiftsLedTeamDto[]>(shiftsApi.me.leads, { key: 'shifts:leads', ttl: 0, lazy: true })
const led = computed(() => ledTeams.value ?? [])
// The pages around it are for signed-in people; a session that ran out goes to the sign-in page and comes back.
watch(() => error.value?.statusCode, async (code) => {
  if (code === 401) await navigateTo({ path: useAuthPages().login, query: { redirect: route.fullPath } })
}, { immediate: true })

const today = dayKey(new Date(), format.timeZone)
const showPast = ref(false)
type CalendarDay = { year: number, month: number, day: number }
const picked = shallowRef<CalendarDay | undefined>()
const keyOf = (value: CalendarDay) => `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`

const workDays = computed(() => new Set(data.value.map(item => dayKey(item.shift.startsAt, format.timeZone))))
const groups = computed(() => {
  const pickedKey = picked.value ? keyOf(picked.value) : null
  const byDay = new Map<string, MyShiftDto[]>()
  for (const item of data.value) {
    const key = dayKey(item.shift.startsAt, format.timeZone)
    if (pickedKey ? key !== pickedKey : !showPast.value && item.shift.endsAt < new Date().toISOString()) continue
    byDay.set(key, [...(byDay.get(key) ?? []), item])
  }
  return [...byDay.entries()].map(([day, items]) => ({ day, items }))
})
const pastCount = computed(() => data.value.filter(item => item.shift.endsAt < new Date().toISOString()).length)

const statusLabel = (item: MyShiftDto) => item.swap
  ? t(`swapStatuses.${item.swap.status}`, SHIFT_SWAP_STATUS_LABELS[item.swap.status])
  : t(`statuses.${item.assignment.status}`, SHIFT_ASSIGNMENT_STATUS_LABELS[item.assignment.status])
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap justify-end gap-2">
      <UButton
        v-for="team in led"
        :key="team.teamId"
        :to="links.lead(team.teamId)"
        icon="i-lucide-shield-check"
        color="neutral"
        variant="outline"
        :label="t('mine.lead', 'Lead {team}', { team: tr(team.teamName) })"
      />
      <UButton
        icon="i-lucide-calendar-plus"
        color="neutral"
        variant="outline"
        :label="t('feed.title', 'Subscribe in calendar')"
        @click="actions.subscribe()"
      />
      <UButton
        v-if="standalone"
        :to="links.swaps()"
        icon="i-lucide-arrow-left-right"
        color="neutral"
        variant="outline"
        :label="t('mine.openSwaps', 'Open swaps')"
      />
    </div>

    <div
      v-if="loading"
      class="grid gap-4 lg:grid-cols-[20rem_1fr]"
      aria-busy="true"
    >
      <SectionCard loading />
      <SectionCard loading />
    </div>
    <UEmpty
      v-else-if="error && !data.length"
      icon="i-lucide-circle-alert"
      :title="t('mine.loadFailed', 'Your shifts could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!data.length"
      icon="i-lucide-calendar-clock"
      :title="t('mine.empty', 'No shifts yet')"
      :description="t('mine.emptyDescription', 'When a coordinator puts you on a shift, it shows up here.')"
      :actions="[{ label: t('mine.openSwaps', 'Open swaps'), to: links.swaps(), icon: 'i-lucide-arrow-left-right', color: 'neutral', variant: 'outline' }]"
    />
    <div
      v-else
      class="grid items-start gap-4 lg:grid-cols-[20rem_1fr]"
      data-shifts-mine
    >
      <SectionCard
        :title="t('mine.calendar', 'Calendar')"
        icon="i-lucide-calendar"
      >
        <template
          v-if="picked"
          #actions
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-x"
            :label="t('mine.showAll', 'Show all days')"
            @click="picked = undefined"
          />
        </template>
        <UCalendar
          v-model="picked"
          :week-starts-on="1"
          class="w-full"
        >
          <template #day="{ day }">
            <UChip
              :show="workDays.has(keyOf(day))"
              size="2xs"
              position="bottom-right"
            >
              {{ day.day }}
            </UChip>
          </template>
        </UCalendar>
      </SectionCard>

      <div class="flex flex-col gap-4">
        <SectionCard v-if="!groups.length">
          <p class="text-muted text-sm">
            {{ picked ? t('mine.noneThatDay', 'No shifts on that day.') : t('mine.noneUpcoming', 'No upcoming shifts.') }}
          </p>
        </SectionCard>
        <SectionCard
          v-for="group in groups"
          :key="group.day"
          :title="format.day(group.day)"
          flush
        >
          <template
            v-if="group.day === today"
            #actions
          >
            <UBadge
              size="sm"
              variant="subtle"
              :label="t('mine.today', 'Today')"
            />
          </template>
          <ul class="divide-default divide-y">
            <li
              v-for="item in group.items"
              :key="item.assignment.id"
            >
              <ULink
                :to="links.shift(item.assignment.id)"
                class="hover:bg-elevated/50 flex items-center justify-between gap-3 px-4 py-3 transition"
              >
                <div class="flex min-w-0 flex-col">
                  <span class="text-highlighted font-medium tabular-nums">{{ format.time(item.shift.startsAt) }}–{{ format.time(item.shift.endsAt) }}</span>
                  <span class="text-muted truncate text-sm">
                    {{ tr(item.teamName) }}<template v-if="item.roleName"> · {{ tr(item.roleName) }}</template> · {{ tr(item.operationName) }}
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    :status="item.swap ? item.swap.status : item.assignment.status"
                    :label="statusLabel(item)"
                    :colors="{ assigned: 'info', attended: 'success', no_show: 'error', open: 'warning', offered: 'warning', pending_approval: 'warning' }"
                  />
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="text-dimmed size-4"
                  />
                </div>
              </ULink>
            </li>
          </ul>
        </SectionCard>
        <UButton
          v-if="!picked && pastCount"
          color="neutral"
          variant="ghost"
          class="self-start"
          :label="showPast ? t('mine.hidePast', 'Hide past shifts') : t('mine.showPast', 'Show {count} past shifts', { count: pastCount })"
          @click="showPast = !showPast"
        />
      </div>
    </div>
  </div>
</template>
