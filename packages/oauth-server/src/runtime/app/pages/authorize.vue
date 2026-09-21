<script setup lang="ts">
const { user, session } = useUserSession()
const pending = ref(false)

const oauthRequest = computed(() => session.value?.oauthRequest)

useSeoMeta({
  title: 'Authorize',
  description: 'Authorize an application to access your account.',
})

definePageMeta({
  middleware: 'auth',
  footer: false,
})

async function handleAuthorize(approved: boolean) {
  pending.value = true

  try {
    const response = await $fetch<{ redirectUrl: string }>('/oauth/authorize', {
      method: 'POST',
      body: { approved },
    })

    // Navigate to the redirect URL (back to the client application)
    if (response.redirectUrl) {
      window.location.href = response.redirectUrl
    }
  }
  catch (error) {
    console.error('Authorization error:', error)
    pending.value = false
  }
}

// Redirect if no OAuth request
if (!oauthRequest.value) {
  navigateTo('/')
}
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center p-4 pt-[var(--ui-header-height)]">
    <UCard
      v-if="oauthRequest"
      class="shadow-xl max-w-md mt-6 md:mt-0"
    >
      <div class="space-y-6">
        <!-- App requesting access -->
        <div class="text-center">
          <div class="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AppHeaderLogo />
          </div>
          <h1 class="text-xl font-bold text-highlighted">
            {{ oauthRequest.clientName || 'An application' }}
          </h1>
          <p class="text-sm text-muted mt-1">
            wants to access your account
          </p>
          <UBadge v-if="oauthRequest.clientHost">
            {{ oauthRequest.clientHost }}
          </UBadge>
        </div>

        <!-- User card -->
        <div class="flex items-center gap-4 p-4 bg-muted rounded-xl border border-default">
          <UUser
            :name="user?.name"
            :description="user?.email"
            :avatar="{ src: user?.avatarUrl ?? undefined, alt: user?.name }"
            size="lg"
            class="flex-1 min-w-0"
          />
          <UIcon
            name="i-heroicons-check-badge"
            class="size-6 text-success shrink-0"
          />
        </div>

        <!-- Permissions -->
        <div class="bg-muted rounded-xl p-4 border border-default">
          <p class="text-sm font-medium text-toned mb-3">
            This will allow the application to:
          </p>
          <ul class="space-y-2">
            <UPageFeature
              icon="i-heroicons-finger-print"
              description="Verify your identity"
            />
            <UPageFeature
              icon="i-heroicons-user"
              description="Access your profile information"
            />
            <UPageFeature
              icon="i-heroicons-envelope"
              description="Access your email address"
            />
          </ul>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <UButton
            block
            color="neutral"
            variant="outline"
            size="lg"
            :disabled="pending"
            @click="handleAuthorize(false)"
          >
            Deny
          </UButton>
          <UButton
            block
            size="lg"
            :loading="pending"
            @click="handleAuthorize(true)"
          >
            Authorize
          </UButton>
        </div>
      </div>

      <template #footer>
        <p class="text-xs text-center text-muted">
          Make sure you trust this application before authorizing access.
        </p>
      </template>
    </UCard>

    <!-- No request state -->
    <UCard
      v-else
      class="shadow-xl"
    >
      <div class="text-center py-4">
        <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <UIcon
            name="i-heroicons-question-mark-circle"
            class="size-8 text-dimmed"
          />
        </div>
        <h2 class="text-lg font-semibold text-highlighted mb-2">
          No Authorization Request
        </h2>
        <p class="text-muted mb-6">
          There's no pending authorization request.
        </p>
        <UButton to="/">
          Go to Home
        </UButton>
      </div>
    </UCard>
  </div>
</template>
