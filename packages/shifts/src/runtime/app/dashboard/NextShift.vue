<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { MyShiftDto } from '../../../types'
import { computed, surfaceClass, useCachedFetch, useModuleT, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsNextItem' })

// `homeTab`: drawn on the mobile Home tab (`@frigear-nu/dashboard`), where no shift means nothing at all, not an empty card.
const props = defineProps<{ homeTab?: boolean }>()

// The `shifts.next` item of the `crew.home` dashboard: my next shift (or the one running now), with a link to its page,
// where the QR pass shows from `checkInOpensMinutes` before it starts. `GET /api/shifts/me` lists the shifts that have
// not ended, soonest first, cancelled ones left out.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()

// The last response shows at once (also after a restart of the mobile app); every mount asks again in the background.
const { data, error, loading } = useCachedFetch<MyShiftDto[]>(shiftsApi.me.shifts, {
  key: 'shifts:dashboard:next',
  ttl: 0,
  lazy: true,
  query: { from: new Date().toISOString() },
  onResponseError: () => {},
})
// A remembered response may hold shifts that have ended since: never shown as the next one.
const next = computed(() => (data.value ?? []).find(item => (item.assignment.status === 'assigned' || item.assignment.status === 'attended')
  && Date.parse(item.shift.endsAt) > Date.now()))
const running = computed(() => !!next.value && Date.parse(next.value.shift.startsAt) <= Date.now())
</script>

<template>
  <div
    v-if="loading"
    :class="[surfaceClass, 'h-full space-y-3 p-4']"
  >
    <USkeleton class="h-5 w-2/3" />
    <USkeleton class="h-4 w-1/2" />
  </div>
  <div
    v-else-if="error && !data?.length"
    :class="[surfaceClass, 'text-error h-full p-4 text-sm']"
  >
    {{ t('dashboard.nextFailed', 'Could not load your shifts.') }}
  </div>
  <template v-else-if="!next && props.homeTab" />
  <EmptyCard
    v-else-if="!next"
    icon="i-lucide-calendar-clock"
    :title="t('dashboard.nextEmpty', 'No upcoming shifts')"
    :description="t('dashboard.nextEmptyDescription', 'Your next shift shows here once you are on a schedule.')"
    :action-label="t('dashboard.allShifts', 'See my shifts')"
    :to="links.shifts()"
  />
  <div
    v-else
    :class="[surfaceClass, 'flex h-full flex-col gap-3 p-4']"
  >
    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-highlighted text-lg font-semibold">{{ format.range(next.shift.startsAt, next.shift.endsAt) }}</span>
        <UBadge
          v-if="running"
          color="success"
          variant="subtle"
          :label="t('dashboard.nextRunning', 'On now')"
        />
      </div>
      <span class="text-default text-sm">{{ tr(next.teamName) }}<template v-if="next.roleName"> · {{ tr(next.roleName) }}</template></span>
      <span class="text-muted text-xs">{{ tr(next.operationName) }}<template v-if="next.shift.location?.name"> · {{ tr(next.shift.location.name) }}</template></span>
    </div>
    <div class="mt-auto">
      <UButton
        :to="links.shift(next.assignment.id)"
        icon="i-lucide-qr-code"
        trailing-icon="i-lucide-arrow-right"
        :label="t('dashboard.nextPass', 'Open shift and pass')"
      />
    </div>
  </div>
</template>
