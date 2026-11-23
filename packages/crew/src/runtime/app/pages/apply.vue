<script setup lang="ts">
import { crewApi } from '../../utils/api'
import { crewApplyNotice } from '../../utils/status'
import type { CrewApplyDto } from '../../../types'
import { computed, createError, errorMessage, navigateTo, ref, useAuthPages, useCrewLinks, useCrewTranslate, useFetch, useFormat, useHead, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'CrewApplyPage' })

// Where a volunteer applies to an operation's crew (`/crew/apply/:operationSlug`): the operation's application form, or why
// there is none to fill in (not open yet, closed, already applied, ...). Signed-out visitors go to the sign-in page and come
// back. The form is a forms form: its submission registers the application (`forms:submitted`).
const t = useModuleT('crew')
const tr = useCrewTranslate()
const format = useFormat()
const links = useCrewLinks()
const route = useRoute()
const slug = computed(() => String(route.params.operationSlug))

const { data, error, refresh } = await useFetch<CrewApplyDto>(() => crewApi.apply(slug.value), { key: `crew:apply:${slug.value}` })

if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}
else if (error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: t('apply.notFound', 'Operation not found'), fatal: true })
}

const submitted = ref(false)
async function onSubmitted() {
  submitted.value = true
  await refresh()
}

// Where an applicant stands: waitlisted people get their own notice, applied and approved people the "applied" one.
const notice = computed(() => data.value?.state === 'applied' ? crewApplyNotice(data.value.crewStatus, submitted.value) : null)

useHead({ title: computed(() => data.value ? t('apply.title', 'Apply to {operation}', { operation: tr(data.value.operationName) }) : '') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        v-if="data"
        :title="t('apply.title', 'Apply to {operation}', { operation: tr(data.operationName) })"
        :description="t('apply.description', 'Tell us a little about yourself to join the crew.')"
      />
      <UPageBody class="max-w-2xl">
        <UEmpty
          v-if="error && !data && error.statusCode !== 401"
          icon="i-lucide-circle-alert"
          :title="t('apply.loadFailed', 'The application could not be loaded')"
          :description="errorMessage(error, '')"
          :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
        />

        <template v-else-if="data">
          <FormRenderer
            v-if="data.state === 'open' && data.formSlug && !submitted"
            :slug="data.formSlug"
            @submitted="onSubmitted"
          />

          <UAlert
            v-else-if="data.state === 'applied' && notice"
            :icon="notice.icon"
            :color="notice.color"
            variant="subtle"
            :title="t(notice.title.key, notice.title.fallback)"
            :description="t(notice.description.key, notice.description.fallback)"
            :actions="[{ label: t('apply.seeStatus', 'See your status'), to: links.status(), color: 'neutral', variant: 'outline' }]"
          />
          <UAlert
            v-else-if="data.state === 'member'"
            icon="i-lucide-users-round"
            color="success"
            variant="subtle"
            :title="t('apply.member', 'You are on this crew already')"
            :actions="[{ label: t('apply.seeStatus', 'See your status'), to: links.status(), color: 'neutral', variant: 'outline' }]"
          />
          <UAlert
            v-else-if="data.state === 'rejected'"
            icon="i-lucide-circle-x"
            color="neutral"
            variant="subtle"
            :title="t('apply.rejected', 'Your application was not accepted')"
            :description="t('apply.rejectedDescription', 'Thank you for applying. Contact the organisers if you have questions.')"
          />
          <UAlert
            v-else-if="data.state === 'scheduled'"
            icon="i-lucide-calendar-clock"
            color="neutral"
            variant="subtle"
            :title="t('apply.scheduled', 'Applications are not open yet')"
            :description="data.opensAt ? t('apply.opensAt', 'They open {date}.', { date: format.dateTime(data.opensAt) }) : undefined"
          />
          <UAlert
            v-else
            icon="i-lucide-calendar-x"
            color="neutral"
            variant="subtle"
            :title="data.state === 'unavailable' ? t('apply.unavailable', 'This crew is not taking applications') : t('apply.closed', 'Applications are closed')"
          />
        </template>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
