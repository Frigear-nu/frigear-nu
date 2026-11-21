<script setup lang="ts">
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS } from '../../utils/status'
import type { MyCrewDto } from '../../../types'
import { $fetch, errorMessage, navigateTo, useAction, useAuthPages, useConfirmDialog, useCrewLinks, useCrewTranslate, useFetch, useFormat, useHead, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'CrewStatusPage' })

// A volunteer's own crew status: every operation they applied to or work at, with their status, team and role, and a way
// to withdraw. Signed-out visitors go to the sign-in page and come back.
const t = useModuleT('crew')
const tr = useCrewTranslate()
const format = useFormat()
const links = useCrewLinks()
const confirm = useConfirmDialog()
const { run } = useAction()
const route = useRoute()

const { data, error, refresh } = await useFetch<MyCrewDto[]>(crewApi.me.crew, { key: 'crew:me', default: () => [] })
if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}

const label = (status: MyCrewDto['crewStatus']) => t(`admin.statuses.${status}`, CREW_STATUS_LABELS[status])
const withdrawable = (entry: MyCrewDto) => entry.crewStatus === 'applied' || entry.crewStatus === 'waitlisted' || entry.crewStatus === 'approved'

async function withdraw(entry: MyCrewDto) {
  const operation = tr(entry.operationName)
  const confirmed = await confirm({
    title: t('status.withdrawTitle', 'Withdraw from {operation}?', { operation }),
    description: entry.crewStatus === 'approved'
      ? t('status.withdrawApprovedDescription', 'You give up your place on the crew. You can apply again while applications are open.')
      : t('status.withdrawDescription', 'Your application is withdrawn. You can apply again while applications are open.'),
    confirmText: t('status.withdrawAction', 'Withdraw'),
    destructive: true,
  })
  if (!confirmed) return
  const done = await run(
    () => $fetch(crewApi.me.withdraw(entry.operationId), { method: 'POST' }).then(() => true),
    { success: t('status.withdrawn', 'You withdrew from {operation}', { operation }), error: t('status.withdrawFailed', 'Could not withdraw') },
  )
  if (done) await refresh()
}

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
              v-if="withdrawable(entry) || entry.crewStatus === 'withdrawn'"
              #footer
            >
              <div class="flex justify-end gap-2">
                <UButton
                  v-if="withdrawable(entry)"
                  color="neutral"
                  variant="outline"
                  :label="t('status.withdrawAction', 'Withdraw')"
                  @click="withdraw(entry)"
                />
                <UButton
                  v-else
                  :to="links.apply(entry.operationSlug)"
                  :label="t('status.applyAgain', 'Apply again')"
                />
              </div>
            </template>
          </SectionCard>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
