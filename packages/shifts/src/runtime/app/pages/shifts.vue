<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { SHIFT_ASSIGNMENT_STATUS_LABELS, SHIFT_SWAP_STATUS_LABELS } from '../../utils/status'
import { dayKey } from '../../utils/time'
import type { MyShiftDto } from '../../../types'
import { computed, errorMessage, navigateTo, ref, shallowRef, useAuthPages, useFetch, useHead, useModuleT, useRoute, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsMinePage' })

// My shifts: a month calendar marking the days I work, and the list grouped by day (upcoming first, past ones on
// request). Signed-out visitors go to the sign-in page and come back.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()
const route = useRoute()

const { data, error, refresh } = await useFetch<MyShiftDto[]>(shiftsApi.me.shifts, { key: 'shifts:me', default: () => [] })
if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}

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

useHead({ title: () => t('mine.title', 'My shifts') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('mine.title', 'My shifts')"
        :description="t('mine.description', 'Your shifts, your check-in pass and your swaps.')"
      >
        <template #links>
          <UButton
            :to="links.swaps()"
            icon="i-lucide-arrow-left-right"
            color="neutral"
            variant="outline"
            :label="t('mine.openSwaps', 'Open swaps')"
          />
        </template>
      </UPageHeader>
      <UPageBody>
        <UEmpty
          v-if="error && !data.length && error.statusCode !== 401"
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
        />
        <div
          v-else
          class="grid gap-6 lg:grid-cols-[20rem_1fr]"
        >
          <div class="flex flex-col gap-2">
            <SectionCard>
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
            <UButton
              v-if="picked"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :label="t('mine.showAll', 'Show all days')"
              @click="picked = undefined"
            />
          </div>
          <div class="flex flex-col gap-6">
            <p
              v-if="!groups.length"
              class="text-muted text-sm"
            >
              {{ picked ? t('mine.noneThatDay', 'No shifts on that day.') : t('mine.noneUpcoming', 'No upcoming shifts.') }}
            </p>
            <section
              v-for="group in groups"
              :key="group.day"
              class="flex flex-col gap-2"
            >
              <h2 class="text-highlighted text-sm font-semibold">
                {{ format.day(group.day) }}
                <UBadge
                  v-if="group.day === today"
                  class="ms-2"
                  size="sm"
                  :label="t('mine.today', 'Today')"
                />
              </h2>
              <ULink
                v-for="item in group.items"
                :key="item.assignment.id"
                :to="links.shift(item.assignment.id)"
                class="border-default hover:bg-elevated/50 flex items-center justify-between gap-3 rounded-lg border p-3 transition"
              >
                <div class="flex min-w-0 flex-col">
                  <span class="text-highlighted font-medium tabular-nums">{{ format.time(item.shift.startsAt) }}–{{ format.time(item.shift.endsAt) }}</span>
                  <span class="text-muted truncate text-sm">
                    {{ tr(item.teamName) }}<template v-if="item.roleName"> · {{ tr(item.roleName) }}</template> · {{ tr(item.operationName) }}
                  </span>
                </div>
                <StatusBadge
                  :status="item.swap ? item.swap.status : item.assignment.status"
                  :label="statusLabel(item)"
                  :colors="{ assigned: 'info', attended: 'success', no_show: 'error', open: 'warning', offered: 'warning', pending_approval: 'warning' }"
                />
              </ULink>
            </section>
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
      </UPageBody>
    </UPage>
  </UContainer>
</template>
