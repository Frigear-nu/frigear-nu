<script setup lang="ts">
import type { ConsentDto, OAuthScopeDefinition } from '../../../types'
import { isNativeRedirectUri, websiteDomain } from '../../utils'
import { oauthServerApi, oidc } from '../../utils/api'
import { authApi } from '@frigear-nu/auth/api'
import { $fetch, computed, navigateTo, ref, useAppConfig, useAuthPages, useErrorToast, useFetch, useLocaleLink, useModuleT, useRoute } from '#imports'

defineOptions({ name: 'OAuthAuthorizePage' })

const t = useModuleT('oauthServer')
const route = useRoute()
// In this page's language, like the sign-in redirect of `/oauth/authorize`.
const signInPath = useLocaleLink().localize(useAuthPages().login)
const showError = useErrorToast()
// The same branding as the sign-in pages (`app.config.ts`: `users: { authLogo }`).
const logo = useAppConfig().users?.authLogo as string | { light: string, dark: string } | undefined

const { data: consent, error } = await useFetch<ConsentDto>(oauthServerApi.consent, {
  query: route.query,
  key: `oauth-server:consent:${route.fullPath}`,
})

// Not signed in (e.g. the session expired on the way here): sign in and come back.
const signInUrl = `${signInPath}?redirect=${encodeURIComponent(route.fullPath)}`
if (error.value?.statusCode === 401) {
  await navigateTo(signInUrl)
}

const application = computed(() => consent.value?.application)
const domain = computed(() => websiteDomain(application.value?.websiteUrl))
// An icon is an Iconify name (`i-lucide-...`); an image URL is shown as a logo. Without either, the initial.
const iconIsImage = computed(() => /^(?:https?:)?\/\//.test(application.value?.icon ?? '') || application.value?.icon?.startsWith('/'))
const initial = computed(() => application.value?.name.trim().charAt(0).toUpperCase() || '?')

type ScopeItem = { name: string, label: string, description?: string, icon: string }
/** A row on the consent screen: one scope, or a service with `scopes` to open when it has more than one. */
type ScopeRow = { key: string, item: ScopeItem, scopes?: ScopeItem[] }
type ScopeSection = { key: string, title?: string, rows: ScopeRow[] }

const scopeItems = computed<ScopeItem[]>(() => {
  const known: Record<string, Omit<ScopeItem, 'name'>> = {
    openid: {
      label: t('authorize.scope.openid', 'Verify your identity'),
      description: t('authorize.scopeHint.openid', 'Know who you are when you sign in'),
      icon: 'i-lucide-user-check',
    },
    profile: {
      label: t('authorize.scope.profile', 'Your name and profile picture'),
      description: t('authorize.scopeHint.profile', 'See your public profile'),
      icon: 'i-lucide-circle-user',
    },
    email: {
      label: t('authorize.scope.email', 'Your email address'),
      description: t('authorize.scopeHint.email', 'See the email address of your account'),
      icon: 'i-lucide-mail',
    },
  }
  // Older servers only send `scope`; every entry falls back to the scope's name.
  const details = new Map((consent.value?.scopes ?? []).map((scope: OAuthScopeDefinition) => [scope.name, scope]))
  const items = (consent.value?.scope ?? []).map(name => toItem(name, details.get(name), known))
  return mergeIdentity(items, known)
})

// The standard sign-in scopes (`openid`, `profile`, `email`) nearly always come together: one row, under `openid`, that
// lists what it covers, so the rows left go to what the application asks for besides signing in.
const IDENTITY_PARTS = ['profile', 'email']
function mergeIdentity(items: ScopeItem[], known: Record<string, Omit<ScopeItem, 'name'>>): ScopeItem[] {
  const parts = items.filter(item => IDENTITY_PARTS.includes(item.name) && item.label === known[item.name]?.label)
  const openid = items.find(item => item.name === 'openid')
  if (!openid || !parts.length) return items
  const merged: ScopeItem = { ...openid, description: parts.map(part => part.label).join(' · ') }
  return items.filter(item => !parts.includes(item)).map(item => item === openid ? merged : item)
}

function toItem(name: string, scope: OAuthScopeDefinition | undefined, known: Record<string, Omit<ScopeItem, 'name'>> = {}): ScopeItem {
  if (known[name] && !scope?.label) return { name, ...known[name]! }
  // A registry scope often only has a description: it is the best title there is.
  return {
    name,
    label: scope?.label || scope?.description || name,
    description: scope?.label ? scope.description : undefined,
    icon: scope?.icon || 'i-lucide-key-round',
  }
}

// Requested scopes this account may not grant: shown, so nobody wonders why the application lacks them.
const unavailableItems = computed<ScopeItem[]>(() => (consent.value?.unavailable ?? []).map(scope => toItem(scope.name, scope)))

// One consent for every service. The account's own scopes are a row each; every other service is one row that names
// what it covers and opens to its scopes. Without any service (or from an older server) it is one list without headings.
const scopeSections = computed<ScopeSection[]>(() => {
  const items = new Map(scopeItems.value.map(item => [item.name, item]))
  const groups = consent.value?.groups ?? []
  const toRow = (item: ScopeItem): ScopeRow => ({ key: item.name, item })
  if (!groups.some(group => group.service)) return [{ key: 'all', rows: scopeItems.value.map(toRow) }]
  const itemsOf = (group: { scopes: OAuthScopeDefinition[] }) =>
    group.scopes.map(scope => items.get(scope.name)).filter((item): item is ScopeItem => !!item)
  const account = groups.filter(group => !group.service).flatMap(itemsOf)
  const services = groups.filter(group => group.service).map((group): ScopeRow | undefined => {
    const scopes = itemsOf(group)
    if (!scopes.length) return undefined
    const icons = new Set(scopes.map(scope => scope.icon))
    return {
      key: `service:${group.service}`,
      item: {
        name: `service:${group.service}`,
        label: group.service!,
        description: scopes.map(scope => scope.label).join(' · '),
        icon: icons.size === 1 ? scopes[0]!.icon : 'i-lucide-blocks',
      },
      scopes: scopes.length > 1 ? scopes : undefined,
    }
  }).filter((row): row is ScopeRow => !!row)
  return [
    { key: 'account', title: t('authorize.accountGroup', 'Your account'), rows: account.map(toRow) },
    { key: 'services', title: t('authorize.servicesGroup', 'Other services'), rows: services },
  ].filter(section => section.rows.length)
})

// A long request would push Allow/Deny far below the fold: show the first rows, the rest behind "Show all".
const SCOPE_PREVIEW_LIMIT = 7
const showAllScopes = ref(false)
const rowCount = computed(() => scopeSections.value.reduce((sum, section) => sum + section.rows.length, 0))
const visibleScopeSections = computed<ScopeSection[]>(() => {
  const sections = scopeSections.value
  if (showAllScopes.value || rowCount.value <= SCOPE_PREVIEW_LIMIT) return sections
  // Every service row already sums up a service, so the account's rows give way first, down to about half the rows;
  // otherwise a long account list would hide that other services are asked for at all.
  const services = sections.find(section => section.key === 'services')?.rows.length ?? 0
  const accountRows = sections.find(section => section.key === 'account')?.rows.length ?? 0
  const accountBudget = services ? Math.min(accountRows, Math.max(SCOPE_PREVIEW_LIMIT - services, Math.ceil(SCOPE_PREVIEW_LIMIT / 2))) : SCOPE_PREVIEW_LIMIT
  const budget: Record<string, number> = { account: accountBudget, services: SCOPE_PREVIEW_LIMIT - accountBudget, all: SCOPE_PREVIEW_LIMIT }
  return sections
    .map(section => ({ ...section, rows: section.rows.slice(0, budget[section.key] ?? 0) }))
    .filter(section => section.rows.length)
})

const openServices = ref<string[]>([])
function toggleService(key: string) {
  openServices.value = openServices.value.includes(key)
    ? openServices.value.filter(open => open !== key)
    : [...openServices.value, key]
}

const pending = ref<'approve' | 'deny' | 'switch' | null>(null)
// Set once a native app's redirect is ready: iOS only opens a custom scheme from a tap, not after a fetch.
const appRedirectUrl = ref<string | null>(null)

async function decide(approved: boolean) {
  pending.value = approved ? 'approve' : 'deny'
  try {
    const { redirectUrl } = await $fetch<{ redirectUrl: string }>(oidc.authorize, {
      method: 'POST',
      body: { ...route.query, approved },
    })
    if (isNativeRedirectUri(redirectUrl)) {
      appRedirectUrl.value = redirectUrl
      pending.value = null
      window.location.href = redirectUrl
      return
    }
    await navigateTo(redirectUrl, { external: true })
  }
  catch (err) {
    showError(err, t('authorize.failed', 'Could not complete the sign-in. Please try again.'))
    pending.value = null
  }
}

// "Not you?": sign out, then sign in again and come back to this request. A full load drops the old session state.
async function switchAccount() {
  pending.value = 'switch'
  try {
    await $fetch(authApi.logout, { method: 'POST' })
    await navigateTo(signInUrl, { external: true })
  }
  catch (err) {
    showError(err, t('authorize.switchFailed', 'Could not sign you out. Please try again.'))
    pending.value = null
  }
}
</script>

<template>
  <AuthCard
    v-if="consent && appRedirectUrl"
    :title="t('authorize.returnTitle', 'Return to {name}', { name: consent.application.name })"
    :description="t('authorize.returnHint', 'If the app did not open, tap the button below. You can close this window afterwards.')"
  >
    <UButton
      :to="appRedirectUrl"
      external
      block
      size="xl"
      class="min-h-11"
      icon="i-lucide-external-link"
      :label="t('authorize.returnToApp', 'Return to the app')"
    />
  </AuthCard>

  <UContainer
    v-else-if="consent && application"
    class="flex min-h-[calc(100dvh-var(--ui-header-height,4rem))] flex-col items-center justify-center gap-6 py-6 sm:py-16"
  >
    <template v-if="logo">
      <img
        v-if="typeof logo === 'string'"
        :src="logo"
        alt=""
        class="h-12 w-auto sm:h-16"
      >
      <template v-else>
        <img
          :src="logo.light"
          alt=""
          class="h-12 w-auto sm:h-16 dark:hidden"
        >
        <img
          :src="logo.dark"
          alt=""
          class="hidden h-12 w-auto sm:h-16 dark:block"
        >
      </template>
    </template>

    <UPageCard
      class="w-full max-w-md"
      variant="outline"
      :ui="{ container: 'w-full min-w-0 p-5 sm:p-8' }"
    >
      <div class="flex w-full min-w-0 flex-col gap-6">
        <!-- Who is asking -->
        <div class="flex flex-col items-center gap-3 text-center">
          <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary ring ring-default">
            <img
              v-if="iconIsImage"
              :src="application.icon!"
              alt=""
              class="size-full object-cover"
            >
            <UIcon
              v-else-if="application.icon"
              :name="application.icon"
              class="size-8"
            />
            <span
              v-else
              class="text-2xl font-semibold"
              aria-hidden="true"
            >{{ initial }}</span>
          </div>

          <div class="flex min-w-0 max-w-full flex-col items-center gap-1">
            <h1 class="text-xl font-semibold text-pretty break-words text-highlighted">
              {{ t('authorize.title', 'Sign in to {name}', { name: application.name }) }}
            </h1>
            <ULink
              v-if="application.websiteUrl"
              :to="application.websiteUrl"
              external
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex max-w-full min-w-0 items-center gap-1 text-sm text-muted hover:text-default"
            >
              <UIcon
                name="i-lucide-globe"
                class="size-3.5 shrink-0"
              />
              <span class="truncate">{{ domain }}</span>
            </ULink>
          </div>
        </div>

        <!-- Signed in as -->
        <div class="flex min-w-0 items-center gap-3 rounded-lg border border-default bg-elevated/50 p-3">
          <UAvatar
            :src="consent.user.avatar || undefined"
            :alt="consent.user.name"
            size="md"
            class="shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ consent.user.name }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ consent.user.email }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            class="shrink-0 px-0"
            :label="t('authorize.notYou', 'Not you?')"
            :aria-label="t('authorize.switchAccount', 'Sign in with another account')"
            :loading="pending === 'switch'"
            :disabled="!!pending"
            @click="switchAccount"
          />
        </div>

        <!-- What it may do -->
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium text-highlighted">
            {{ t('authorize.wants', '{name} wants to:', { name: application.name }) }}
          </p>
          <section
            v-for="section in visibleScopeSections"
            :key="section.key"
            class="flex flex-col gap-2"
            :aria-label="section.title"
          >
            <h2
              v-if="section.title"
              class="text-xs font-medium tracking-wide text-muted uppercase"
            >
              {{ section.title }}
            </h2>
            <ul class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default">
              <li
                v-for="row in section.rows"
                :key="row.key"
              >
                <component
                  :is="row.scopes ? 'button' : 'div'"
                  :type="row.scopes ? 'button' : undefined"
                  :aria-expanded="row.scopes ? openServices.includes(row.key) : undefined"
                  class="flex w-full items-start gap-3 p-3 text-left"
                  :class="row.scopes && 'cursor-pointer hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary'"
                  @click="row.scopes && toggleService(row.key)"
                >
                  <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
                    <UIcon
                      :name="row.item.icon"
                      class="size-4"
                    />
                  </div>
                  <div class="min-w-0 flex-1 pt-0.5">
                    <p class="text-sm font-medium break-words text-highlighted">
                      {{ row.item.label }}
                    </p>
                    <p
                      v-if="row.item.description && !openServices.includes(row.key)"
                      class="text-xs break-words text-muted"
                      :class="row.scopes && 'line-clamp-2'"
                    >
                      {{ row.item.description }}
                    </p>
                  </div>
                  <UIcon
                    v-if="row.scopes"
                    :name="openServices.includes(row.key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="mt-2 size-4 shrink-0 text-muted"
                  />
                </component>
                <ul
                  v-if="row.scopes && openServices.includes(row.key)"
                  class="flex flex-col gap-2 pr-3 pb-3 pl-14"
                >
                  <li
                    v-for="scope in row.scopes"
                    :key="scope.name"
                    class="flex min-w-0 items-start gap-2"
                  >
                    <UIcon
                      :name="scope.icon"
                      class="mt-0.5 size-3.5 shrink-0 text-muted"
                    />
                    <div class="min-w-0">
                      <p class="text-xs font-medium break-words text-highlighted">
                        {{ scope.label }}
                      </p>
                      <p
                        v-if="scope.description"
                        class="text-xs break-words text-muted"
                      >
                        {{ scope.description }}
                      </p>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>
          </section>
          <UButton
            v-if="rowCount > SCOPE_PREVIEW_LIMIT"
            color="neutral"
            variant="link"
            size="sm"
            class="self-start px-0"
            :trailing-icon="showAllScopes ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="showAllScopes
              ? t('authorize.showFewer', 'Show fewer')
              : t('authorize.showAll', 'Show all {count}', { count: rowCount })"
            :aria-expanded="showAllScopes"
            @click="showAllScopes = !showAllScopes"
          />
          <section
            v-if="unavailableItems.length"
            class="flex flex-col gap-2"
            :aria-label="t('authorize.unavailable', 'Not available to your account')"
          >
            <h2 class="text-xs font-medium tracking-wide text-muted uppercase">
              {{ t('authorize.unavailable', 'Not available to your account') }}
            </h2>
            <p class="text-xs text-muted">
              {{ t('authorize.unavailableHint', 'The application will not get these.') }}
            </p>
            <ul class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-dashed border-default">
              <li
                v-for="scope in unavailableItems"
                :key="scope.name"
                class="flex items-start gap-3 p-3 opacity-60"
              >
                <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
                  <UIcon
                    name="i-lucide-ban"
                    class="size-4"
                  />
                </div>
                <div class="min-w-0 flex-1 pt-0.5">
                  <p class="text-sm font-medium break-words text-muted line-through">
                    {{ scope.label }}
                  </p>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <!-- Decide -->
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              block
              class="order-last min-h-11 sm:order-first"
              :label="t('authorize.deny', 'Deny')"
              :loading="pending === 'deny'"
              :disabled="!!pending"
              @click="decide(false)"
            />
            <UButton
              size="xl"
              block
              class="min-h-11"
              :label="t('authorize.allow', 'Allow')"
              :loading="pending === 'approve'"
              :disabled="!!pending"
              @click="decide(true)"
            />
          </div>
          <p class="text-center text-xs text-pretty text-muted">
            {{ t('authorize.trust', 'Only allow {name} if you trust it.', { name: application.name }) }}
          </p>
        </div>
      </div>
    </UPageCard>
  </UContainer>

  <AuthCard
    v-else
    :title="t('authorize.invalidTitle', 'This sign-in request cannot be completed')"
    :description="error?.statusMessage || t('authorize.invalidDescription', 'The request is invalid.')"
  />
</template>
