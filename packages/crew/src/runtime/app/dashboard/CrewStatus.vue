<script setup lang="ts">
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS } from '../../utils/status'
import type { CrewStatus, MyCrewDto } from '../../../types'
import { computed, surfaceClass, useCrewLinks, useCrewTranslate, useLazyFetch, useModuleT } from '#imports'

defineOptions({ name: 'CrewStatusItem' })

// The `crew.status` item of the `crew.home` dashboard: where the person applied or works, with the status of each, and a
// link to `/crew/status`. `GET /api/crew/me` lists every status, withdrawn ones too.
const t = useModuleT('crew')
const tr = useCrewTranslate()
const links = useCrewLinks()

const { data, status, error } = useLazyFetch<MyCrewDto[]>(crewApi.me.crew, {
  key: 'crew:dashboard:status',
  default: () => [],
  onResponseError: () => {},
})
const loading = computed(() => status.value === 'pending' && !data.value?.length)

// What is still going on first; people who withdrew or were rejected only show when nothing else does.
const entries = computed(() => {
  const all = data.value ?? []
  const open = all.filter(entry => entry.crewStatus !== 'withdrawn' && entry.crewStatus !== 'rejected')
  return (open.length ? open : all).slice(0, 4)
})

const label = (value: CrewStatus) => t(`admin.statuses.${value}`, CREW_STATUS_LABELS[value])
const color = (value: CrewStatus) => ({ approved: 'success', applied: 'info', waitlisted: 'warning', rejected: 'error', withdrawn: 'neutral' } as const)[value]
</script>

<template>
  <div
    v-if="loading"
    :class="[surfaceClass, 'h-full space-y-3 p-4']"
  >
    <USkeleton class="h-4 w-2/3" />
    <USkeleton class="h-4 w-1/3" />
  </div>
  <div
    v-else-if="error && !data?.length"
    :class="[surfaceClass, 'text-error h-full p-4 text-sm']"
  >
    {{ t('dashboard.statusFailed', 'Could not load your crew status.') }}
  </div>
  <EmptyCard
    v-else-if="!entries.length"
    icon="i-lucide-hand-heart"
    :title="t('dashboard.statusEmpty', 'You have not applied yet')"
    :description="t('dashboard.statusEmptyDescription', 'When you apply to an operation, it shows up here.')"
  />
  <div
    v-else
    :class="[surfaceClass, 'flex h-full flex-col']"
  >
    <ul class="divide-default flex-1 divide-y px-4 text-sm [&>li]:py-2.5">
      <li
        v-for="entry in entries"
        :key="entry.operationId"
        class="flex items-center justify-between gap-3"
      >
        <div class="flex min-w-0 flex-col">
          <span class="text-highlighted truncate font-medium">{{ tr(entry.operationName) }}</span>
          <span class="text-muted truncate text-xs">{{ tr(entry.teamName) }} · {{ tr(entry.roleLabel) }}</span>
        </div>
        <UBadge
          :color="color(entry.crewStatus)"
          variant="subtle"
          :label="label(entry.crewStatus)"
        />
      </li>
    </ul>
    <div class="border-default border-t px-4 py-2.5">
      <UButton
        :to="links.status()"
        variant="link"
        color="neutral"
        size="xs"
        class="p-0"
        trailing-icon="i-lucide-arrow-right"
        :label="t('dashboard.statusLink', 'My crew')"
      />
    </div>
  </div>
</template>
