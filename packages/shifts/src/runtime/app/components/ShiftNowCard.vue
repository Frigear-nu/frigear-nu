<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftsNowDto } from '../../../types'
import { computed, useLazyFetch, useModuleT, useShiftsFormat, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftNowCard' })

// "Working now": who is on shift in an operation at this moment, per team, with the leads on duty.
const props = defineProps<{ operationId: string }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()

const { data, status, error, refresh } = useLazyFetch<ShiftsNowDto>(() => shiftsApi.now(props.operationId), { key: computed(() => `shifts:now:${props.operationId}`) })
const loading = computed(() => status.value === 'pending' && !data.value)
const nameOf = (person: { name: string | null, userId: number }) => person.name ?? `#${person.userId}`
</script>

<template>
  <SectionCard
    :title="t('now.title', 'Working now')"
    :description="t('now.description', 'Who is on shift right now, and the lead on duty per team.')"
    icon="i-lucide-radio"
    :loading="loading"
  >
    <template #actions>
      <UButton
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="ghost"
        :aria-label="t('now.refresh', 'Refresh who is working')"
        @click="refresh()"
      />
    </template>
    <p
      v-if="error"
      class="text-error text-sm"
    >
      {{ t('now.loadFailed', 'Could not load who is working.') }}
    </p>
    <p
      v-else-if="!data?.teams.length"
      class="text-muted text-sm"
    >
      {{ t('now.empty', 'Nobody is on shift right now.') }}
    </p>
    <div
      v-else
      class="flex flex-col gap-4"
    >
      <div
        v-for="team in data.teams"
        :key="team.teamId"
        class="flex flex-col gap-1"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-highlighted text-sm font-semibold">{{ tr(team.teamName) }}</span>
          <UBadge
            v-if="team.leads.length"
            color="primary"
            variant="subtle"
            icon="i-lucide-shield-check"
            :label="t('now.leadOnDuty', 'Lead on duty: {names}', { names: team.leads.map(nameOf).join(', ') })"
          />
          <UBadge
            v-else
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-alert"
            :label="t('now.noLead', 'No lead on duty')"
          />
        </div>
        <ul class="text-sm">
          <li
            v-for="shift in team.shifts"
            :key="shift.id"
            class="text-muted"
          >
            <span class="tabular-nums">{{ format.time(shift.startsAt) }}–{{ format.time(shift.endsAt) }}</span>:
            <span class="text-default">{{ shift.assignees.map(item => nameOf(item.person) + (item.person.phone ? ` (${item.person.phone})` : '')).join(', ') || t('now.nobody', 'nobody') }}</span>
          </li>
        </ul>
      </div>
    </div>
  </SectionCard>
</template>
