<script setup lang="ts">
import { computed, navigateTo, onMounted, ref, useAppConfig, useAuth, useModuleT, useRoute } from '#imports'
import type { AuthAppConfig } from '../../types'
import { safeReturnTo } from '../../utils'
import { useAuthClientConfig } from '../utils/runtime'

defineOptions({ name: 'AuthClientLoginPage' })

const t = useModuleT('auth.client')
const route = useRoute()
const config = useAuthClientConfig()
const { authenticated } = useAuth()
// Apps brand the page through `app.config.ts`: `authentication: { login: { title, description, logo, icon } }`.
const branding = (useAppConfig().authentication as AuthAppConfig | undefined)?.login ?? {}

const returnTo = computed(() => safeReturnTo(route.query.redirect))
const failure = ref<string>()
const failedBefore = computed(() => route.query.error === 'sign-in')

onMounted(() => {
  // Already signed in (e.g. the back button after signing in): go on.
  if (authenticated.value) void navigateTo(returnTo.value ?? config.redirect.afterLogin, { replace: true })
})

function onError(error: unknown) {
  failure.value = error instanceof Error ? error.message : String(error)
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-var(--ui-header-height,0rem))] flex-col items-center justify-center gap-6 py-12 sm:py-16">
    <template v-if="branding.logo">
      <img
        v-if="typeof branding.logo === 'string'"
        :src="branding.logo"
        alt=""
        class="h-16 w-auto"
      >
      <template v-else>
        <img
          :src="branding.logo.light"
          alt=""
          class="h-16 w-auto dark:hidden"
        >
        <img
          :src="branding.logo.dark"
          alt=""
          class="hidden h-16 w-auto dark:block"
        >
      </template>
    </template>
    <div
      v-else-if="branding.icon"
      class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
    >
      <UIcon
        :name="branding.icon"
        class="size-8"
      />
    </div>

    <UPageCard
      class="w-full max-w-md"
      variant="outline"
    >
      <div class="flex flex-col gap-5">
        <div class="flex flex-col items-center gap-1.5 text-center">
          <h1 class="text-xl font-semibold text-highlighted">
            {{ branding.title ?? t('login.title', 'Sign in') }}
          </h1>
          <p class="text-sm text-muted">
            {{ branding.description ?? t('login.description', 'Sign in with your account to continue.') }}
          </p>
        </div>

        <UAlert
          v-if="failure || failedBefore"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('login.failed', 'Sign-in failed')"
          :description="failure ?? t('login.failedDescription', 'The sign-in was not completed. Try again.')"
        />

        <AuthSignInButton
          :return-to="returnTo"
          size="xl"
          block
          @error="onError"
        />
      </div>
    </UPageCard>
  </UContainer>
</template>
