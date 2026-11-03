<script setup lang="ts">
import { navigateTo, onMounted, ref, useModuleT, useOAuth, useRuntimeConfig } from '#imports'

defineOptions({ name: 'OAuthClientCallbackPage' })

const t = useModuleT('oauthClient')
const config = useRuntimeConfig().public.oauthClient
const { completeLogin } = useOAuth()
const failure = ref<string>()

// In a browser the authorization server redirects here; a native app receives its redirect through the URL scheme
// instead (the plugin completes those).
onMounted(async () => {
  try {
    const { returnTo } = await completeLogin(window.location.href)
    await navigateTo(returnTo ?? config.redirect.afterLogin, { replace: true })
  }
  catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
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
