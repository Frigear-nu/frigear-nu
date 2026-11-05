<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AccountSignedInApp } from '../../../../types'
import { $fetch, computed, errorMessage, useCachedFetch, useConfirmDialog, useErrorToast, useFormat, useModuleT, useToast, useUserSession } from '#imports'

defineOptions({ name: 'AccountSignedInApps' })

// The API of `@frigear-nu/oauth-server` (`oauthServerApi.me.sessions`), which this module does not depend on: the
// section is only rendered when it is installed.
const SESSIONS = '/api/oauth-server/me/sessions'

const t = useModuleT('account.security.signedInApps')
const toast = useToast()
const showError = useErrorToast()
const confirm = useConfirmDialog()
const format = useFormat()
const { user } = useUserSession()

const { data, error, loading, refresh } = await useCachedFetch<AccountSignedInApp[]>(SESSIONS, {
  key: () => `account:signed-in-apps:${user.value?.id ?? 'anonymous'}`,
  ttl: 0,
  watch: false,
})
const sessions = computed(() => data.value ?? [])

async function signOut(session: AccountSignedInApp) {
  const confirmed = await confirm({
    title: t('signOutConfirm.title', 'Sign out of {name}?', { name: session.application.name }),
    description: t('signOutConfirm.description', 'The application has to ask you to sign in again. Your account and its data are not affected.'),
    confirmText: t('signOut', 'Sign out of app'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`${SESSIONS}/${encodeURIComponent(session.id)}`, { method: 'DELETE' })
    toast.add({ title: t('signedOut', 'Signed out.'), description: session.application.name, color: 'success', icon: 'i-lucide-check' })
    await refresh()
  }
  catch (e) {
    showError(e, t('signOutError', 'Could not sign out of the application.'))
  }
}

async function signOutAll() {
  const confirmed = await confirm({
    title: t('signOutAllConfirm.title', 'Sign out of every app?'),
    description: t('signOutAllConfirm.description', 'Every application listed here, on every device, has to ask you to sign in again. You stay signed in on this website.'),
    confirmText: t('signOutAll', 'Sign out of all apps'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(SESSIONS, { method: 'DELETE' })
    toast.add({ title: t('signedOutAll', 'Signed out of every app.'), color: 'success', icon: 'i-lucide-check' })
    await refresh()
  }
  catch (e) {
    showError(e, t('signOutAllError', 'Could not sign out of the applications.'))
  }
}

const menu = (session: AccountSignedInApp): DropdownMenuItem[][] => [[
  { label: t('signOut', 'Sign out of app'), icon: 'i-lucide-log-out', color: 'error', onSelect: () => signOut(session) },
]]
</script>

<template>
  <SectionCard
    :title="t('title', 'Signed-in apps')"
    :description="t('description', 'Applications that signed in with your account. Changing your password or email signs them all out.')"
    :loading="loading"
    flush
  >
    <template
      v-if="sessions.length"
      #actions
    >
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-log-out"
        :label="t('signOutAll', 'Sign out of all apps')"
        @click="signOutAll"
      />
    </template>
    <ul
      v-if="sessions.length"
      class="divide-y divide-default"
    >
      <li
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center gap-3 px-4 py-3"
      >
        <UIcon
          :name="session.application.icon || 'i-lucide-app-window'"
          class="size-5 shrink-0 text-muted"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ session.application.name }}
          </p>
          <p class="text-sm text-muted">
            {{ t('activity', 'Signed in {signedIn} · last active {lastActive}', { signedIn: format.date(session.signedInAt), lastActive: format.dateTime(session.lastActiveAt) }) }}
          </p>
        </div>
        <RowMenu
          :items="menu(session)"
          :subject="session.application.name"
        />
      </li>
    </ul>
    <UEmpty
      v-else-if="error"
      variant="naked"
      icon="i-lucide-circle-alert"
      :title="t('loadError', 'Could not load your signed-in apps.')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else
      variant="naked"
      icon="i-lucide-app-window"
      :title="t('empty', 'No applications are signed in with your account.')"
    />
  </SectionCard>
</template>
