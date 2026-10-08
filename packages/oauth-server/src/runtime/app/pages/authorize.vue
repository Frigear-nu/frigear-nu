<script setup lang="ts">
import type { ConsentDto } from '../../../types'

defineOptions({ name: 'OAuthAuthorizePage' })

const route = useRoute()
const signInPath = (useRuntimeConfig().public.users as { pages?: { login?: string } } | undefined)?.pages?.login || '/login'

const { data: consent, error } = await useFetch<ConsentDto>('/api/oauth-server/consent', {
  query: route.query,
  key: `oauth-server:consent:${route.fullPath}`,
})

// Not signed in (e.g. the session expired on the way here): sign in and come back.
if (error.value?.statusCode === 401) {
  await navigateTo(`${signInPath}?redirect=${encodeURIComponent(route.fullPath)}`)
}

const scopeLabels: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Your name and profile picture',
  email: 'Your email address',
}

const pending = ref<'approve' | 'deny' | null>(null)
const failure = ref<string | null>(null)

async function decide(approved: boolean) {
  pending.value = approved ? 'approve' : 'deny'
  failure.value = null
  try {
    const { redirectUrl } = await $fetch<{ redirectUrl: string }>('/oauth/authorize', {
      method: 'POST',
      body: { ...route.query, approved },
    })
    await navigateTo(redirectUrl, { external: true })
  }
  catch (err) {
    failure.value = (err as { statusMessage?: string }).statusMessage || 'Something went wrong. Please try again.'
    pending.value = null
  }
}
</script>

<template>
  <UContainer class="py-10">
    <UCard
      v-if="consent"
      class="mx-auto max-w-md"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon
            :name="consent.application.icon || 'i-lucide-globe'"
            class="size-8"
          />
          <div>
            <h1 class="text-lg font-semibold">
              {{ consent.application.name }}
            </h1>
            <p class="text-sm text-muted">
              {{ consent.application.websiteUrl }}
            </p>
          </div>
        </div>
      </template>

      <p class="mb-3 text-sm">
        Signed in as <strong>{{ consent.user.name }}</strong> ({{ consent.user.email }}).
        <strong>{{ consent.application.name }}</strong> wants to:
      </p>
      <ul class="mb-4 list-inside list-disc space-y-1 text-sm">
        <li
          v-for="scope in consent.scope"
          :key="scope"
        >
          {{ scopeLabels[scope] ?? scope }}
        </li>
      </ul>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        :title="failure"
      />

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :loading="pending === 'deny'"
            :disabled="!!pending"
            @click="decide(false)"
          >
            Deny
          </UButton>
          <UButton
            :loading="pending === 'approve'"
            :disabled="!!pending"
            @click="decide(true)"
          >
            Allow
          </UButton>
        </div>
      </template>
    </UCard>

    <UAlert
      v-else
      class="mx-auto max-w-md"
      color="error"
      variant="subtle"
      title="This sign-in request cannot be completed"
      :description="error?.statusMessage || 'The request is invalid.'"
    />
  </UContainer>
</template>
