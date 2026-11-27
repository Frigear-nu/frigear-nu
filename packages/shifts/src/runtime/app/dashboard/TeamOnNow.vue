<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftsMyNowDto } from '../../../types'
import { computed, onBeforeUnmount, surfaceClass, useCachedFetch, useModuleT, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsOnNowItem' })

// The `shifts.on-now` item of the `crew.home` dashboard: my teams that have a shift running, with who is on and the lead
// on duty (names only). It refreshes itself every minute while it is open.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()

// Coming back shows the last response while asking again. Live data: never written to the device (`persist: false`),
// so a cold start of the mobile app never shows who was on shift days ago.
const { data, error, loading, refresh } = useCachedFetch<ShiftsMyNowDto>(shiftsApi.me.now, {
  key: 'shifts:dashboard:on-now',
  ttl: 0,
  persist: false,
  lazy: true,
  onResponseError: () => {},
})
if (import.meta.client) {
  const timer = setInterval(() => refresh(), 60_000)
  onBeforeUnmount(() => clearInterval(timer))
}

const teams = computed(() => data.value?.teams ?? [])
const nameOf = (person: { name: string | null, userId: number }) => person.name ?? `#${person.userId}`
</script>

<template>
  <div
    v-if="loading"
    :class="[surfaceClass, 'h-full space-y-3 p-4']"
  >
    <USkeleton class="h-4 w-2/3" />
    <USkeleton class="h-4 w-1/2" />
  </div>
  <div
    v-else-if="error && !teams.length"
    :class="[surfaceClass, 'text-error h-full p-4 text-sm']"
  >
    {{ t('dashboard.onNowFailed', 'Could not load who is on shift.') }}
  </div>
  <EmptyCard
    v-else-if="!teams.length"
    icon="i-lucide-radio"
    :title="t('dashboard.onNowEmpty', 'Nobody on your teams is on shift')"
    :description="t('dashboard.onNowEmptyDescription', 'When a shift of one of your teams is running, you see who is on it.')"
  />
  <ul
    v-else
    :class="[surfaceClass, 'divide-default h-full divide-y px-4 text-sm [&>li]:py-3']"
  >
    <li
      v-for="team in teams"
      :key="team.teamId"
      class="flex flex-col gap-1"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-highlighted font-medium">{{ tr(team.teamName) }}</span>
        <UBadge
          v-if="team.leads.length"
          color="primary"
          variant="subtle"
          icon="i-lucide-shield-check"
          :label="t('dashboard.onNowLead', 'Lead on duty: {names}', { names: team.leads.map(nameOf).join(', ') })"
        />
        <UBadge
          v-else
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          :label="t('dashboard.onNowNoLead', 'No lead on duty')"
        />
      </div>
      <span class="text-muted text-xs">{{ tr(team.operationName) }} · {{ t('dashboard.onNowPeople', '{count} on now', { count: team.people.length }) }}</span>
      <span class="text-default text-xs">{{ team.people.map(nameOf).join(', ') }}</span>
    </li>
  </ul>
</template>
