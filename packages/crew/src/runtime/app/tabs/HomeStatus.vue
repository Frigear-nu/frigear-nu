<script setup lang="ts">
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS } from '../../utils/status'
import type { MyCrewDto } from '../../../types'
import { computed, errorMessage, navigateTo, useAuthPages, useCrewLinks, useCrewTranslate, useFormat, useLazyFetch, useModuleT, useRoute, watch } from '#imports'

defineOptions({ name: 'CrewHomeStatusTab' })

// My crew: every operation the person applied to or works at, with their status, team and role. The My crew tab of the
// crew home (`crew.dashboard`), and the body of the status page where there is one. Volunteers do not withdraw
// themselves: stepping down goes through their coordinator, who changes the status in the admin.
const t = useModuleT('crew')
const tr = useCrewTranslate()
const format = useFormat()
const links = useCrewLinks()
const route = useRoute()

const { data, status, error, refresh } = useLazyFetch<MyCrewDto[]>(crewApi.me.crew, { key: 'crew:me', default: () => [] })
const loading = computed(() => status.value === 'pending' && !data.value.length)
// The pages around it are for signed-in people; a session that ran out goes to the sign-in page and comes back.
watch(() => error.value?.statusCode, async (code) => {
  if (code === 401) await navigateTo({ path: useAuthPages().login, query: { redirect: route.fullPath } })
}, { immediate: true })

// What is still going on first: applications and places, then the ones that ended.
const ORDER: Record<MyCrewDto['crewStatus'], number> = { approved: 0, waitlisted: 1, applied: 2, rejected: 3, withdrawn: 4 }
const entries = computed(() => [...data.value].sort((a, b) => ORDER[a.crewStatus] - ORDER[b.crewStatus]))

const label = (value: MyCrewDto['crewStatus']) => t(`admin.statuses.${value}`, CREW_STATUS_LABELS[value])
const facts = (entry: MyCrewDto) => [
  { key: 'team', label: t('admin.team', 'Team'), value: tr(entry.teamName) },
  ...(entry.crewStatus === 'approved' ? [{ key: 'role', label: t('admin.role', 'Role'), value: tr(entry.roleLabel) }] : []),
  ...(entry.crewStatus === 'waitlisted' && entry.waitlistPosition ? [{ key: 'position', label: t('status.position', 'Place on the waiting list'), value: String(entry.waitlistPosition) }] : []),
  { key: 'applied', label: t('admin.applied', 'Applied'), value: entry.appliedAt ? format.dateTime(entry.appliedAt) : null },
]
</script>

<template>
  <div
    v-if="loading"
    class="grid gap-4 md:grid-cols-2"
    aria-busy="true"
  >
    <SectionCard
      v-for="index in 2"
      :key="index"
      loading
    />
  </div>
  <UEmpty
    v-else-if="error && !data.length"
    icon="i-lucide-circle-alert"
    :title="t('status.loadFailed', 'Your crew status could not be loaded')"
    :description="errorMessage(error, '')"
    :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
  />
  <UEmpty
    v-else-if="!data.length"
    icon="i-lucide-hand-heart"
    :title="t('status.empty', 'You have not applied yet')"
    :description="t('status.emptyDescription', 'When you apply to an operation, or join with an invite, it shows up here.')"
  />
  <div
    v-else
    class="flex flex-col gap-4"
    data-crew-status
  >
    <div class="grid gap-4 md:grid-cols-2">
      <SectionCard
        v-for="entry in entries"
        :key="entry.operationId"
        :title="tr(entry.operationName)"
        icon="i-lucide-hand-heart"
      >
        <template #actions>
          <StatusBadge
            :status="entry.crewStatus"
            :label="label(entry.crewStatus)"
            :colors="{ applied: 'info', waitlisted: 'warning', withdrawn: 'neutral' }"
          />
        </template>
        <DescriptionList :items="facts(entry)" />
        <template
          v-if="entry.crewStatus === 'withdrawn'"
          #footer
        >
          <div class="flex justify-end">
            <UButton
              :to="links.apply(entry.operationSlug)"
              icon="i-lucide-rotate-ccw"
              :label="t('status.applyAgain', 'Apply again')"
            />
          </div>
        </template>
      </SectionCard>
    </div>
    <p class="text-muted text-sm">
      {{ t('status.stepDown', 'Need to step down? Contact your coordinator.') }}
    </p>
  </div>
</template>
