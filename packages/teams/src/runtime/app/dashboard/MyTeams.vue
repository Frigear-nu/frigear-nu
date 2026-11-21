<script setup lang="ts">
import { teamsApi } from '../../utils/api'
import type { MyTeamDto } from '../../../types'
import { computed, surfaceClass, useLazyFetch, useModuleT, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamsMineItem' })

// The `teams.mine` item of the `crew.home` dashboard: the teams the person is on, with their role. `GET /api/teams/me`
// lists explicit memberships first, then roles a mapping rule gives them (`source: 'mapped'`).
const t = useModuleT('teams')
const tr = useTeamsTranslate()

const { data, status, error } = useLazyFetch<MyTeamDto[]>(teamsApi.me.teams, {
  key: 'teams:dashboard:mine',
  default: () => [],
  onResponseError: () => {},
})
const loading = computed(() => status.value === 'pending' && !data.value?.length)
const teams = computed(() => (data.value ?? []).slice(0, 6))
const more = computed(() => Math.max(0, (data.value?.length ?? 0) - teams.value.length))

// The role key as a word: the ladder's own label is not part of the answer.
const roleName = (key: string) => key.replace(/[-_]+/g, ' ').replace(/^./, letter => letter.toUpperCase())
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
    {{ t('dashboard.mineFailed', 'Could not load your teams.') }}
  </div>
  <EmptyCard
    v-else-if="!teams.length"
    icon="i-lucide-users-round"
    :title="t('dashboard.mineEmpty', 'You are not on a team yet')"
    :description="t('dashboard.mineEmptyDescription', 'The teams you work in show here, with your role.')"
  />
  <div
    v-else
    :class="[surfaceClass, 'h-full']"
  >
    <ul class="divide-default divide-y px-4 text-sm [&>li]:py-2.5">
      <li
        v-for="team in teams"
        :key="team.teamId"
        class="flex items-center justify-between gap-3"
      >
        <span class="text-highlighted truncate font-medium">{{ tr(team.name) }}</span>
        <span class="flex shrink-0 items-center gap-2">
          <UBadge
            v-if="team.source === 'mapped'"
            color="neutral"
            variant="outline"
            :label="t('dashboard.mapped', 'By role')"
          />
          <UBadge
            color="primary"
            variant="subtle"
            :label="roleName(team.role)"
          />
        </span>
      </li>
    </ul>
    <p
      v-if="more"
      class="text-muted border-default border-t px-4 py-2.5 text-xs"
    >
      {{ t('dashboard.mineMore', '{count} more teams', { count: more }) }}
    </p>
  </div>
</template>
