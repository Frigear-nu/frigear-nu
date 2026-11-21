<script setup lang="ts">
import { operationsApi } from '../../utils/api'
import type { OperationDto } from '../../../types'
import { computed, surfaceClass, useFormat, useLazyFetch, useModuleT, useOperationLinks, useOperationsTranslate } from '#imports'

defineOptions({ name: 'OperationsUpcomingItem' })

// The `operations.upcoming` item of the `crew.home` dashboard: the operations the person takes part in that have not
// ended, soonest first. `GET /api/operations/me` answers `[]` until crew (or a team role) reports where they work.
const t = useModuleT('operations')
const tr = useOperationsTranslate()
const format = useFormat()
const links = useOperationLinks()

const { data, status, error } = useLazyFetch<OperationDto[]>(operationsApi.me.operations, {
  key: 'operations:dashboard:upcoming',
  default: () => [],
  onResponseError: () => {},
})
const loading = computed(() => status.value === 'pending' && !data.value?.length)

const upcoming = computed(() => {
  const now = Date.now()
  return (data.value ?? [])
    .filter(operation => (operation.status === 'planning' || operation.status === 'active')
      && (!operation.endsAt || Date.parse(operation.endsAt) >= now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 5)
})

const when = (operation: OperationDto) => operation.endsAt
  ? format.dateRange(operation.startsAt, operation.endsAt, { dateStyle: 'medium' })
  : format.date(operation.startsAt)
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
    {{ t('dashboard.upcomingFailed', 'Could not load your operations.') }}
  </div>
  <EmptyCard
    v-else-if="!upcoming.length"
    icon="i-lucide-tent"
    :title="t('dashboard.upcomingEmpty', 'No upcoming operations')"
    :description="t('dashboard.upcomingEmptyDescription', 'The operations you work at show here.')"
  />
  <ul
    v-else
    :class="[surfaceClass, 'divide-default h-full divide-y px-4 text-sm [&>li]:py-2.5']"
  >
    <li
      v-for="operation in upcoming"
      :key="operation.id"
      class="flex flex-col gap-0.5"
    >
      <NuxtLink
        v-if="operation.public"
        :to="links.operation(operation.slug)"
        class="text-highlighted font-medium hover:underline"
      >
        {{ tr(operation.name) }}
      </NuxtLink>
      <span
        v-else
        class="text-highlighted font-medium"
      >{{ tr(operation.name) }}</span>
      <span class="text-muted text-xs">{{ when(operation) }}</span>
    </li>
  </ul>
</template>
