<script setup lang="ts">
import { navigateTo, onMounted, ref, useAuth, useModuleT } from '#imports'
import { OAuthError } from '../../core/errors'
import { useAuthClientConfig } from '../utils/runtime'

defineOptions({ name: 'AuthClientCallbackPage' })

const t = useModuleT('auth.client')
const config = useAuthClientConfig()
const { completeLogin } = useAuth()
const failure = ref<string>()

// In a browser the authorization server redirects here; a native app receives its redirect through the URL scheme
// instead (the plugin completes those).
onMounted(async () => {
  try {
    const { returnTo } = await completeLogin(window.location.href)
    await navigateTo(returnTo ?? config.redirect.afterLogin, { replace: true })
  }
  catch (error) {
    // The error text of a redirect is whatever the URL says: never show it, only what we know it means.
    const code = error instanceof OAuthError ? error.code : undefined
    failure.value = code === 'access_denied'
      ? t('callback.denied', 'The sign-in was cancelled.')
      : error instanceof OAuthError && error.kind === 'transient'
        ? t('callback.offline', 'The sign-in server could not be reached. Check the connection and try again.')
        : t('callback.generic', 'The sign-in could not be completed.')
    if (import.meta.dev) console.error('[@frigear-nu/auth] Sign-in failed:', error)
  }
})
</script>

<template>
  <UContainer class="flex min-h-[calc(100dvh-var(--ui-header-height,0rem))] flex-col items-center justify-center py-12">
    <UEmpty
      v-if="failure"
      icon="i-lucide-triangle-alert"
      :title="t('callback.failed', 'Sign-in failed')"
      :description="failure"
      :actions="[{ label: t('callback.retry', 'Try signing in again'), to: config.redirect.login }]"
    />
    <div
      v-else
      class="flex flex-col items-center gap-3 text-muted"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
      <p>{{ t('callback.pending', 'Signing you in…') }}</p>
    </div>
  </UContainer>
</template>
