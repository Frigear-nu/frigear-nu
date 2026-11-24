<script setup lang="ts">
// A signed-in page (the `'/**'` route rule): the desktop shell, who signed in, and one call to `/api/me`. In remote mode
// that is the issuer's API (NUXT_PUBLIC_AUTHENTICATION_CLIENT_API_BASE) with the access token; in local mode the
// bundled server's own route (`local/server/api/me.get.ts`) with the session cookie.
interface Me {
  id: number | string
  name: string
  email: string
}

const { user } = useUserSession()
const { mode } = useRuntimeConfig().public.desktop
const { data: me, status, error, refresh } = await useApi<Me>('/api/me')

// The shell is only known in the window itself: read it after mounting, so a server render (local mode) matches.
const desktop = useDesktop()
const shell = ref<{ os: string, version: string } | null>(null)
onMounted(async () => {
  if (desktop.isDesktop) shell.value = { os: desktop.os, version: await desktop.getVersion() }
})

const errorText = computed(() => {
  const reason = [error.value?.statusCode, error.value?.statusMessage ?? error.value?.message].filter(Boolean).join(' ')
  return mode === 'local'
    ? `${reason}.`
    : `${reason}. Check that the API has /api/me and allows this app's origin for CORS.`
})

const userRows = computed(() => Object.entries(user.value ?? {}).map(([name, value]) => ({
  name,
  value: typeof value === 'object' ? JSON.stringify(value) : String(value),
})))
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-monitor"
      :title="shell ? `Running in the desktop app on ${shell.os}, version ${shell.version}` : 'Running in a browser'"
      :description="mode === 'local' ? 'Local mode: the app\'s own server and database, on this machine.' : 'Remote mode: signed in at your issuer, calling its API.'"
    />

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
        v-if="!me && (status === 'pending' || status === 'idle')"
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
          <code>useUserSession().user</code>
        </p>
      </template>

      <dl class="divide-y divide-default">
        <div
          v-for="row in userRows"
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
