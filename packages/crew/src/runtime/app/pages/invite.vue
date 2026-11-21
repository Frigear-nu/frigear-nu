<script setup lang="ts">
import { crewApi } from '../../utils/api'
import type { MyCrewDto } from '../../../types'
import { $fetch, errorMessage, ref, useAction, useAuthPages, useCrewLinks, useCrewTranslate, useFetch, useHead, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'CrewInvitePage' })

// Accepts an invite link (`/crew/invite/:token`). Opening the page changes nothing: the person joins when they press the
// button, signed in. A link that cannot be used (revoked, expired, used up, unknown) says so.
const t = useModuleT('crew')
const tr = useCrewTranslate()
const links = useCrewLinks()
const route = useRoute()
const { busy, run } = useAction()

// Anonymous visitors get a 401 here: they sign in first and come back to this page.
const { error: sessionError } = await useFetch<MyCrewDto[]>(crewApi.me.crew, { key: 'crew:invite-session' })
const signedOut = sessionError.value?.statusCode === 401
const loginTo = { path: useAuthPages().login, query: { redirect: route.path } }

const joined = ref<MyCrewDto>()
const failure = ref<unknown>()

async function accept() {
  failure.value = undefined
  const result = await run(
    () => $fetch<MyCrewDto>(crewApi.acceptInvite(String(route.params.token)), { method: 'POST' }).catch((error: unknown) => {
      failure.value = error
      throw error
    }),
  )
  if (result) joined.value = result
}

const failureTitle = () => {
  const status = (failure.value as { statusCode?: number } | undefined)?.statusCode
  if (status === 410) return t('invite.gone', 'This invite link can no longer be used')
  if (status === 409) return t('invite.alreadyMember', 'You are on this team already')
  if (status === 404) return t('invite.unknown', 'This invite link is not valid')
  return t('invite.failed', 'The invite could not be accepted')
}

useHead({ title: () => t('invite.title', 'Join the crew') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('invite.title', 'Join the crew')"
        :description="t('invite.description', 'You were invited to join a crew.')"
      />
      <UPageBody class="max-w-2xl">
        <UAlert
          v-if="joined"
          icon="i-lucide-circle-check"
          color="success"
          variant="subtle"
          :title="t('invite.joined', 'Welcome to the crew of {operation}', { operation: tr(joined.operationName) })"
          :description="t('invite.joinedDescription', 'You are on the team {team}.', { team: tr(joined.teamName) })"
          :actions="[{ label: t('apply.seeStatus', 'See your status'), to: links.status(), color: 'neutral', variant: 'outline' }]"
        />
        <template v-else>
          <UAlert
            v-if="failure"
            icon="i-lucide-circle-alert"
            color="error"
            variant="subtle"
            class="mb-4"
            :title="failureTitle()"
            :description="errorMessage(failure, '')"
          />
          <SectionCard :title="t('invite.cardTitle', 'Accept the invite')">
            <p class="text-muted text-sm">
              {{ signedOut
                ? t('invite.signInFirst', 'Sign in to join the crew. You will come back here afterwards.')
                : t('invite.explanation', 'You join the team you were invited to, with the role in the invite.') }}
            </p>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton
                  v-if="signedOut"
                  :to="loginTo"
                  :label="t('invite.signIn', 'Sign in')"
                />
                <UButton
                  v-else
                  :loading="busy"
                  :label="t('invite.accept', 'Join the crew')"
                  @click="accept"
                />
              </div>
            </template>
          </SectionCard>
        </template>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
