import type { FrigearHandoffDto, FrigearHandoffOpenContext, FrigearHandoffStartDto } from '../../../types'
import { authApi } from '../../utils/api'
import { $fetch, computed, getCurrentScope, onScopeDispose, readonly, ref, useNuxtApp, useRuntimeConfig, useUserSession } from '#imports'

/** Why a handoff ended without a session: cancelled at frigear.nu, too slow, an unverified address, anything else. */
export type FrigearHandoffError = 'denied' | 'expired' | 'unverified' | 'failed'

const FIRST_POLL_MS = 1000
const MAX_POLL_MS = 5000
const BACKOFF = 1.5

const errorOf = (code: string | null | undefined): FrigearHandoffError =>
  code === 'access_denied' ? 'denied' : code === 'oauth-unverified' ? 'unverified' : 'failed'

const statusOf = (error: unknown) => (error as { statusCode?: number, status?: number }).statusCode ?? (error as { status?: number }).status
const codeOf = (error: unknown) => (error as { data?: { data?: { code?: string, error?: string } } }).data?.data

/**
 * "Log in with frigear.nu" in the system browser while this window waits (`oauth.frigear.handoff`, a desktop app).
 * `start()` creates an attempt, opens frigear.nu outside the window (the `auth:frigear:open` app hook, else
 * `window.open`), polls it with backoff and, once the browser came back, collects the cookie session; it resolves the
 * path to go to (or `undefined` when cancelled or failed, with `error` set). `reopen()` opens the browser again,
 * `cancel()` ends the attempt.
 */
export const useFrigearHandoff = () => {
  const nuxtApp = useNuxtApp()
  const isEnabled = computed(() => useRuntimeConfig().public.authentication?.frigearHandoff === true)
  /** `idle`, `waiting` (for the browser), `completing` (collecting the session). */
  const state = ref<'idle' | 'waiting' | 'completing'>('idle')
  const error = ref<FrigearHandoffError | null>(null)
  let attempt: FrigearHandoffStartDto | undefined
  // Bumped by `cancel()` and every `start()`, so a stale poll loop stops.
  let run = 0
  let wake: (() => void) | undefined

  async function open(url: string) {
    const ctx: FrigearHandoffOpenContext = { url, handled: false }
    // Typed by the generated `auth:frigear:open` hook; called loosely so this file needs no generated types.
    await (nuxtApp.callHook as unknown as (name: string, ctx: FrigearHandoffOpenContext) => Promise<void>)('auth:frigear:open', ctx)
    if (!ctx.handled && typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
  }

  const sleep = (ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    wake = () => {
      clearTimeout(timer)
      resolve()
    }
  })

  function fail(reason: FrigearHandoffError) {
    error.value = reason
    state.value = 'idle'
    attempt = undefined
    return undefined
  }

  async function start(options: { redirect?: string, scope?: string } = {}): Promise<string | undefined> {
    const current = ++run
    error.value = null
    state.value = 'waiting'
    try {
      attempt = await $fetch<FrigearHandoffStartDto>(authApi.frigearHandoffs.start, { method: 'POST', body: options })
    }
    catch {
      return fail('failed')
    }
    await open(attempt.authorizeUrl)

    const id = attempt.id
    const expiresAt = new Date(attempt.expiresAt).getTime()
    let delay = FIRST_POLL_MS
    while (current === run) {
      await sleep(delay)
      if (current !== run) return undefined
      delay = Math.min(MAX_POLL_MS, delay * BACKOFF)
      let status: FrigearHandoffDto
      try {
        status = await $fetch<FrigearHandoffDto>(authApi.frigearHandoffs.handoff(id))
      }
      catch (cause) {
        // Offline for a moment: keep waiting until the attempt expires. A refused attempt cookie ends it.
        const code = statusOf(cause)
        if (code === 401 || code === 403) return fail('failed')
        if (Date.now() >= expiresAt) return fail('expired')
        continue
      }
      if (current !== run) return undefined
      if (status.status === 'pending') continue
      if (status.status === 'expired') {
        await $fetch(authApi.frigearHandoffs.handoff(id), { method: 'DELETE' }).catch(() => {})
        return fail('expired')
      }
      if (status.status === 'failed') {
        await $fetch(authApi.frigearHandoffs.handoff(id), { method: 'DELETE' }).catch(() => {})
        return fail(errorOf(status.error))
      }
      state.value = 'completing'
      try {
        const { redirect } = await $fetch<{ redirect: string }>(authApi.frigearHandoffs.complete(id), { method: 'POST' })
        await useUserSession().fetch()
        state.value = 'idle'
        attempt = undefined
        return redirect
      }
      catch (cause) {
        const data = codeOf(cause)
        if (data?.code === 'handoff_pending') {
          state.value = 'waiting'
          continue
        }
        return fail(data?.code === 'handoff_expired' ? 'expired' : errorOf(data?.error))
      }
    }
    return undefined
  }

  /** Opens frigear.nu again for the attempt in progress (the user closed the browser tab). */
  async function reopen() {
    if (attempt && state.value === 'waiting') await open(attempt.authorizeUrl)
  }

  /** Ends the attempt in progress; a browser that comes back later finds nothing to complete. */
  async function cancel() {
    const id = attempt?.id
    run++
    wake?.()
    state.value = 'idle'
    attempt = undefined
    if (id) await $fetch(authApi.frigearHandoffs.handoff(id), { method: 'DELETE' }).catch(() => {})
  }

  // A page that goes away stops polling (the attempt simply expires).
  if (getCurrentScope()) {
    onScopeDispose(() => {
      run++
      wake?.()
    })
  }

  return { isEnabled, state: readonly(state), error, pending: computed(() => state.value !== 'idle'), start, reopen, cancel }
}
