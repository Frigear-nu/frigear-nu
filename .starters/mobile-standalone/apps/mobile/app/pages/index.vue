<script setup lang="ts">
// A signed-in page (oauthClient `protect: 'all'`): the id_token claims, and one call to your API with the access token.
interface Me {
  id: number | string
  name: string
  email: string
}

const { claims } = useOAuth()
const { data: me, status, error, refresh } = useApi<Me>('/api/me')

// The standalone starter's apps/web has /api/me. Another API may not: point NUXT_PUBLIC_OAUTH_CLIENT_API_BASE at yours.
const errorText = computed(() => {
  const reason = [error.value?.statusCode, error.value?.statusMessage ?? error.value?.message].filter(Boolean).join(' ')
  return `${reason}. Check that the API has /api/me and allows this app's origin for CORS.`
})

const claimRows = computed(() => Object.entries(claims.value ?? {}).map(([name, value]) => ({
  name,
  value: typeof value === 'object' ? JSON.stringify(value) : String(value),
})))
</script>

<template>
  <div class="flex flex-col gap-4">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">
            GET /api/me
          </h2>
          <UButton
            label="Reload profile"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </div>
      </template>

      <USkeleton
        v-if="status === 'pending' || status === 'idle'"
        class="h-10 w-full"
      />
      <UAlert
        v-else-if="error"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="The API call failed"
        :description="errorText"
      />
      <UUser
        v-else-if="me"
        :name="me.name"
        :description="me.email"
        :avatar="{ alt: me.name }"
      />
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <h2 class="font-semibold">
          Your sign-in
        </h2>
        <p class="text-sm text-muted">
          The claims of the ID token the issuer returned.
        </p>
      </template>

      <dl class="divide-y divide-default">
        <div
          v-for="row in claimRows"
          :key="row.name"
          class="flex items-start justify-between gap-3 px-4 py-2.5"
        >
          <dt class="text-sm font-medium">
            {{ row.name }}
          </dt>
          <dd class="min-w-0 break-all text-right text-sm text-muted">
            {{ row.value }}
          </dd>
        </div>
      </dl>
    </UCard>
  </div>
</template>
