<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftSwapDto } from '../../../types'
import { computed, surfaceClass, useLazyFetch, useModuleT, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsSwapsItem' })

// The `shifts.swaps` item of the `crew.home` dashboard: the open swaps I could take, soonest first, with a link to the
// marketplace. `GET /api/shifts/swaps` already leaves out my own, started and ineligible ones.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()

const { data, status, error } = useLazyFetch<ShiftSwapDto[]>(shiftsApi.swaps, {
  key: 'shifts:dashboard:swaps',
  default: () => [],
  onResponseError: () => {},
})
const loading = computed(() => status.value === 'pending' && !data.value?.length)
const swaps = computed(() => [...(data.value ?? [])].sort((a, b) => Date.parse(a.shift.startsAt) - Date.parse(b.shift.startsAt)))
const shown = computed(() => swaps.value.slice(0, 3))
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
    v-else-if="error && !data?.length"
    :class="[surfaceClass, 'text-error h-full p-4 text-sm']"
  >
    {{ t('dashboard.swapsFailed', 'Could not load the open swaps.') }}
  </div>
  <EmptyCard
    v-else-if="!swaps.length"
    icon="i-lucide-repeat"
    :title="t('dashboard.swapsEmpty', 'No open swaps')"
    :description="t('dashboard.swapsEmptyDescription', 'Shifts other people give away show here when you could take them.')"
  />
  <div
    v-else
    :class="[surfaceClass, 'flex h-full flex-col']"
  >
    <p class="text-highlighted px-4 pt-3 text-sm font-semibold">
      {{ t('dashboard.swapsCount', '{count} open swaps you can take', { count: swaps.length }) }}
    </p>
    <ul class="divide-default flex-1 divide-y px-4 text-sm [&>li]:py-2.5">
      <li
        v-for="swap in shown"
        :key="swap.id"
        class="flex flex-col gap-0.5"
      >
        <span class="text-highlighted font-medium">{{ format.range(swap.shift.startsAt, swap.shift.endsAt) }}</span>
        <span class="text-muted text-xs">{{ tr(swap.shift.teamName) }}</span>
      </li>
    </ul>
    <div class="border-default border-t px-4 py-2.5">
      <UButton
        :to="links.swaps()"
        variant="link"
        color="neutral"
        size="xs"
        class="p-0"
        trailing-icon="i-lucide-arrow-right"
        :label="t('dashboard.swapsLink', 'See the swaps')"
      />
    </div>
  </div>
</template>
