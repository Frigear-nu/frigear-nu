<script setup lang="ts">
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS } from '../../utils/status'
import type { MyCrewDto } from '../../../types'
import { errorMessage, navigateTo, useAuthPages, useCrewLinks, useCrewTranslate, useFetch, useFormat, useHead, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'CrewStatusPage' })

// A volunteer's own crew status: every operation they applied to or work at, with their status, team and role. Volunteers
// do not withdraw themselves: stepping down goes through their coordinator, who changes the status in the admin.
// Signed-out visitors go to the sign-in page and come back.
const t = useModuleT('crew')
const tr = useCrewTranslate()
const format = useFormat()
const links = useCrewLinks()
const route = useRoute()

const { data, error, refresh } = await useFetch<MyCrewDto[]>(crewApi.me.crew, { key: 'crew:me', default: () => [] })
if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}

const label = (status: MyCrewDto['crewStatus']) => t(`admin.statuses.${status}`, CREW_STATUS_LABELS[status])

useHead({ title: () => t('status.title', 'My crew') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('status.title', 'My crew')"
        :description="t('status.description', 'Your applications and your places on a crew.')"
      />
      <UPageBody class="max-w-2xl">
        <UEmpty
          v-if="error && !data.length && error.statusCode !== 401"
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
        >
          <SectionCard
            v-for="entry in data"
            :key="entry.operationId"
            :title="tr(entry.operationName)"
          >
            <template #actions>
              <StatusBadge
                :status="entry.crewStatus"
                :label="label(entry.crewStatus)"
              />
            </template>
            <DescriptionList
              :items="[
                { key: 'team', label: t('admin.team', 'Team'), value: tr(entry.teamName) },
                ...(entry.crewStatus === 'approved' ? [{ key: 'role', label: t('admin.role', 'Role'), value: tr(entry.roleLabel) }] : []),
                ...(entry.crewStatus === 'waitlisted' && entry.waitlistPosition ? [{ key: 'position', label: t('status.position', 'Place on the waiting list'), value: String(entry.waitlistPosition) }] : []),
                { key: 'applied', label: t('admin.applied', 'Applied'), value: entry.appliedAt ? format.dateTime(entry.appliedAt) : null },
              ]"
            />
            <template
              v-if="entry.crewStatus === 'withdrawn'"
              #footer
            >
              <div class="flex justify-end gap-2">
                <UButton
                  :to="links.apply(entry.operationSlug)"
                  :label="t('status.applyAgain', 'Apply again')"
                />
              </div>
            </template>
          </SectionCard>
          <p class="text-muted text-sm">
            {{ t('status.stepDown', 'Need to step down? Contact your coordinator.') }}
          </p>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
