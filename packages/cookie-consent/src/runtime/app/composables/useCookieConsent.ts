import type { NuxtApp } from '#app'
import type { ConsentDto, ConsentState } from '../../../types'
import { cookieConsentApi } from '../../utils/api'
import { acceptAllChoices, buildConsent, normalizeConsent, rejectAllChoices } from '../../utils/consent'

const createCookieConsent = (nuxtApp: NuxtApp) => {
  const config = useRuntimeConfig().public.cookieConsent!

  const cookie = useCookie<ConsentState | string | null>(config.cookieName, {
    maxAge: config.maxAge,
    path: '/',
    sameSite: 'lax',
    secure: !import.meta.dev,
    default: () => null,
  })

  // Legacy `accepted`/`rejected` values are migrated, outdated versions count as "not responded".
  const consent = computed(() => normalizeConsent(cookie.value, config.categories, config.version))
  const hasResponded = computed(() => !!consent.value)
  const categories = config.categories
  const isPreferencesOpen = useState('cookie-consent:preferences', () => false)

  const isAllowed = (key: string) => consent.value?.categories[key] === true

  async function persistToUser(state: ConsentState) {
    if (!config.persistToUser) return
    const { loggedIn } = useUserSession()
    if (!loggedIn.value) return
    try {
      await $fetch<ConsentDto>(cookieConsentApi.root, { method: 'POST', body: { categories: state.categories, version: state.v } })
    }
    catch (error) {
      // The cookie is the source of truth for the browser; a failed audit write must not break the UI.
      console.warn('[cookie-consent] Failed to store consent on the user.', error)
    }
  }

  async function save(choices: Record<string, boolean>) {
    const previous = consent.value
    const state = buildConsent(categories, config.version, choices)
    cookie.value = state
    isPreferencesOpen.value = false
    await nuxtApp.callHook('cookie-consent:change', state, previous)
    await persistToUser(state)
    return state
  }

  const acceptAll = () => save(acceptAllChoices(categories))
  const rejectAll = () => save(rejectAllChoices(categories))

  /** Withdraws consent: only required categories remain, and the banner shows again. */
  async function reset() {
    const previous = consent.value
    const state = buildConsent(categories, config.version, rejectAllChoices(categories))
    cookie.value = null
    await nuxtApp.callHook('cookie-consent:change', null, previous)
    await persistToUser(state)
  }

  /** Signed-in users who have not answered on this device pick up the choice stored on their account. */
  async function hydrateFromUser() {
    if (!config.persistToUser || hasResponded.value) return
    const { loggedIn } = useUserSession()
    if (!loggedIn.value) return
    try {
      const { consent: stored } = await $fetch<ConsentDto>(cookieConsentApi.root)
      const state = normalizeConsent(stored, config.categories, config.version, stored?.ts)
      if (state) {
        cookie.value = state
        await nuxtApp.callHook('cookie-consent:change', state, null)
      }
    }
    catch {
      // not critical - the visitor is simply asked again
    }
  }

  const openPreferences = () => {
    isPreferencesOpen.value = true
  }

  return { config, categories, consent, hasResponded, isAllowed, acceptAll, rejectAll, save, reset, hydrateFromUser, isPreferencesOpen, openPreferences }
}

// One instance per Nuxt app (not a module-level singleton) so SSR requests never share consent state.
const instances = new WeakMap<NuxtApp, ReturnType<typeof createCookieConsent>>()

export function useCookieConsent() {
  const nuxtApp = useNuxtApp()
  let instance = instances.get(nuxtApp)
  if (!instance) {
    // Not the return value of `runWithContext`: on the server it is a Promise (unctx's `callAsync`). The callback
    // itself runs synchronously, so take the instance from it.
    let created: ReturnType<typeof createCookieConsent> | undefined
    nuxtApp.runWithContext(() => {
      created = effectScope(true).run(() => createCookieConsent(nuxtApp))
    })
    instance = created!
    instances.set(nuxtApp, instance)
  }
  return instance
}

/**
 * Runs `callback` once the visitor has granted `category` - immediately if they already did, or as
 * soon as they do. The optional return value is called when consent is withdrawn.
 *
 *     onCookieConsent("analytics", () => { startTracking(); return () => stopTracking() })
 */
export function onCookieConsent(category: string, callback: () => (() => void) | undefined) {
  const { isAllowed } = useCookieConsent()
  let cleanup: (() => void) | undefined

  const stop = watch(() => isAllowed(category), (allowed) => {
    if (allowed && !cleanup) cleanup = callback()
    else if (!allowed && cleanup) {
      cleanup()
      cleanup = undefined
    }
  }, { immediate: true, flush: 'sync' })

  if (getCurrentScope()) onScopeDispose(stop)
  return stop
}
