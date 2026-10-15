<script setup lang="ts">
import type { ConsentDto } from '../../../types'

defineOptions({ name: 'OAuthAuthorizePage' })

const t = useModuleT('oauthServer')
const route = useRoute()
const signInPath = useAuthPages().login
const showError = useErrorToast()

const { data: consent, error } = await useFetch<ConsentDto>('/api/oauth-server/consent', {
  query: route.query,
  key: `oauth-server:consent:${route.fullPath}`,
})

// Not signed in (e.g. the session expired on the way here): sign in and come back.
if (error.value?.statusCode === 401) {
  await navigateTo(`${signInPath}?redirect=${encodeURIComponent(route.fullPath)}`)
}

const scopeLabel = (scope: string) => {
  const known: Record<string, string> = {
    openid: t('authorize.scope.openid', 'Verify your identity'),
    profile: t('authorize.scope.profile', 'Your name and profile picture'),
    email: t('authorize.scope.email', 'Your email address'),
  }
  return known[scope] ?? scope
}

const pending = ref<'approve' | 'deny' | null>(null)

async function decide(approved: boolean) {
  pending.value = approved ? 'approve' : 'deny'
  try {
    const { redirectUrl } = await $fetch<{ redirectUrl: string }>('/oauth/authorize', {
      method: 'POST',
      body: { ...route.query, approved },
    })
    await navigateTo(redirectUrl, { external: true })
  }
  catch (err) {
    showError(err, t('authorize.failed', 'Could not complete the sign-in. Please try again.'))
    pending.value = null
  }
}
</script>

<template>
  <AuthCard
    v-if="consent"
    :title="t('authorize.title', 'Sign in to {name}', { name: consent.application.name })"
  >
    <template #description>
      {{ t('authorize.signedInAs', 'Signed in as {name} ({email}).', { name: consent.user.name, email: consent.user.email }) }}
    </template>

    <div class="flex items-center gap-3">
      <UIcon
        :name="consent.application.icon || 'i-lucide-globe'"
        class="size-8 shrink-0"
      />
      <div class="min-w-0">
        <p class="text-highlighted font-medium">
          {{ consent.application.name }}
        </p>
        <p class="truncate text-sm text-muted">
          {{ consent.application.websiteUrl }}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-2 text-sm">
      <p>{{ t('authorize.wants', '{name} wants to:', { name: consent.application.name }) }}</p>
      <ul class="list-inside list-disc space-y-1">
        <li
          v-for="scope in consent.scope"
          :key="scope"
        >
          {{ scopeLabel(scope) }}
        </li>
      </ul>
    </div>

    <div class="flex justify-end gap-2">
      <UButton
        color="neutral"
        variant="outline"
        :label="t('authorize.deny', 'Deny')"
        :loading="pending === 'deny'"
        :disabled="!!pending"
        @click="decide(false)"
      />
      <UButton
        :label="t('authorize.allow', 'Allow')"
        :loading="pending === 'approve'"
        :disabled="!!pending"
        @click="decide(true)"
      />
    </div>
  </AuthCard>

  <AuthCard
    v-else
    :title="t('authorize.invalidTitle', 'This sign-in request cannot be completed')"
    :description="error?.statusMessage || t('authorize.invalidDescription', 'The request is invalid.')"
  />
</template>
