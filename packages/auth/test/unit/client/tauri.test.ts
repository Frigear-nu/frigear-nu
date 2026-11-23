import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSignInFlow } from '../../../src/runtime/client/core'
import {
  isTauri,
  listenForDeepLinkCallbacks,
  loadTauriStoreStorage,
  systemBrowserUserAgent,
  tauriStoreStorage,
} from '../../../src/runtime/client/tauri/adapters'
import type { DeepLinkPluginLike, StorePluginLike, TauriStoreLike } from '../../../src/runtime/client/tauri/adapters'
import { tauriUsesDeepLinks } from '../../../src/runtime/client/utils'
import { json, setup } from './helpers'

const REDIRECT = 'nu.frigear.desktop:/auth/callback'

/** `@tauri-apps/plugin-store`: values in memory, `saved` holds what reached the disk. */
function fakeStore() {
  const values = new Map<string, unknown>()
  const saved = new Map<string, unknown>()
  const store: TauriStoreLike = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async (key, value) => void values.set(key, value),
    delete: async key => values.delete(key),
    save: vi.fn(async () => {
      saved.clear()
      values.forEach((value, key) => saved.set(key, value))
    }),
  }
  return { store, values, saved }
}

/** `@tauri-apps/plugin-deep-link`. */
function fakeDeepLink(current: string[] | null = null) {
  const handlers = new Set<(urls: string[]) => void>()
  const plugin: DeepLinkPluginLike = {
    getCurrent: async () => current,
    onOpenUrl: async (handler) => {
      handlers.add(handler)
      return () => void handlers.delete(handler)
    },
  }
  return { plugin, emit: (urls: string[]) => [...handlers].forEach(fn => fn(urls)), count: () => handlers.size }
}

/** The window's `focus` event, as `systemBrowserUserAgent`'s `onReturn`. */
function fakeFocus() {
  const listeners = new Set<() => void>()
  return {
    onReturn: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    focus: () => [...listeners].forEach(fn => fn()),
    count: () => listeners.size,
  }
}

afterEach(() => {
  const scope = globalThis as { isTauri?: unknown, __TAURI_INTERNALS__?: unknown }
  delete scope.isTauri
  delete scope.__TAURI_INTERNALS__
})

describe('isTauri', () => {
  it('detects a Tauri v2 webview by `isTauri` or `__TAURI_INTERNALS__`', () => {
    const scope = globalThis as { isTauri?: unknown, __TAURI_INTERNALS__?: unknown }
    expect(isTauri()).toBe(false)
    scope.isTauri = true
    expect(isTauri()).toBe(true)
    delete scope.isTauri
    scope.__TAURI_INTERNALS__ = {}
    expect(isTauri()).toBe(true)
  })
})

describe('tauriUsesDeepLinks', () => {
  it('uses deep links in production builds with `auto`, a redirect in development', () => {
    expect(tauriUsesDeepLinks('auto', false)).toBe(true)
    expect(tauriUsesDeepLinks(undefined, false)).toBe(true)
    expect(tauriUsesDeepLinks('auto', true)).toBe(false)
    expect(tauriUsesDeepLinks('deep-link', true)).toBe(true)
    expect(tauriUsesDeepLinks('redirect', false)).toBe(false)
  })
})

describe('tauriStoreStorage', () => {
  it('round-trips strings and saves every change to disk', async () => {
    const { store, saved } = fakeStore()
    const storage = tauriStoreStorage(store)
    expect(await storage.get('oauth:app:tokens')).toBeNull()

    await storage.set('oauth:app:tokens', '{"accessToken":"a"}')
    expect(await storage.get('oauth:app:tokens')).toBe('{"accessToken":"a"}')
    expect(saved.get('oauth:app:tokens')).toBe('{"accessToken":"a"}')

    await storage.remove('oauth:app:tokens')
    expect(await storage.get('oauth:app:tokens')).toBeNull()
    expect(saved.has('oauth:app:tokens')).toBe(false)
  })

  it('reads anything but a string as missing, and does not save when nothing was removed', async () => {
    const { store, values } = fakeStore()
    values.set('weird', { not: 'a string' })
    const storage = tauriStoreStorage(store)
    expect(await storage.get('weird')).toBeNull()
    await storage.remove('absent')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('loads `auth.json` without auto-save', async () => {
    const { store } = fakeStore()
    const plugin: StorePluginLike = { load: vi.fn(async () => store) }
    await loadTauriStoreStorage(plugin)
    expect(plugin.load).toHaveBeenCalledWith('auth.json', { defaults: {}, autoSave: false })
  })
})

describe('sign-in through the system browser', () => {
  async function setupFlow() {
    const opened: string[] = []
    const opener = { openUrl: vi.fn(async (url: string | URL) => void opened.push(String(url))) }
    const focus = fakeFocus()
    let release!: () => void
    const ready = new Promise<void>(resolve => (release = resolve))
    const { client } = setup(async () => {
      await ready
      return json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
    }, { redirectUri: REDIRECT })
    const userAgent = systemBrowserUserAgent(opener, { onReturn: focus.onReturn })
    const signingIn = { value: false }
    const flow = createSignInFlow(client, { userAgent, onChange: value => (signingIn.value = value) })
    const callbackUrl = (index = -1) => `${REDIRECT}?code=abc&state=${new URL(opened.at(index)!).searchParams.get('state')}`
    return { client, flow, opener, opened, focus, signingIn, release, callbackUrl, userAgent }
  }

  it('opens the authorization URL in the default browser', async () => {
    const { flow, opener, opened } = await setupFlow()
    await flow.login()
    expect(opener.openUrl).toHaveBeenCalledOnce()
    expect(new URL(opened[0]!).searchParams.get('redirect_uri')).toBe(REDIRECT)
  })

  it('stops signing in when the user comes back to the app, and a second attempt still completes', async () => {
    const { client, flow, focus, signingIn, release, callbackUrl } = await setupFlow()
    await flow.login()
    expect(signingIn.value).toBe(true)
    expect(focus.count()).toBe(1)

    focus.focus()
    expect(signingIn.value).toBe(false)
    expect(focus.count()).toBe(0)

    await flow.login()
    expect(signingIn.value).toBe(true)
    release()
    await flow.complete(callbackUrl())
    expect(await client.isAuthenticated()).toBe(true)
    expect(signingIn.value).toBe(false)
    expect(focus.count()).toBe(0)
  })

  it('still completes the first sign-in after a second one started', async () => {
    const { client, flow, release, callbackUrl } = await setupFlow()
    await flow.login()
    await flow.login()
    release()
    await flow.complete(callbackUrl(0))
    expect(await client.isAuthenticated()).toBe(true)
  })

  it('does not end a sign-in whose redirect is being exchanged when the window regains focus', async () => {
    const { client, flow, focus, signingIn, release, callbackUrl } = await setupFlow()
    await flow.login()
    const completing = flow.complete(callbackUrl())
    focus.focus()
    expect(signingIn.value).toBe(true)
    release()
    await completing
    expect(await client.isAuthenticated()).toBe(true)
  })

  it('never reports a dismissal with `onReturn: false`, and `close()` is a no-op', async () => {
    const opener = { openUrl: vi.fn(async () => undefined) }
    const onDismissed = vi.fn()
    const userAgent = systemBrowserUserAgent(opener, { onReturn: false })
    await userAgent.open('https://id.example.test/oauth/authorize', { redirectUri: REDIRECT, onDismissed })
    await userAgent.close?.()
    expect(onDismissed).not.toHaveBeenCalled()
  })

  it('fails the sign-in when the browser cannot open', async () => {
    const { flow, opener, focus, signingIn } = await setupFlow()
    opener.openUrl.mockRejectedValueOnce(new Error('no browser'))
    await expect(flow.login()).rejects.toThrow('no browser')
    expect(signingIn.value).toBe(false)
    expect(focus.count()).toBe(0)
  })
})

describe('listenForDeepLinkCallbacks', () => {
  const isCallbackUrl = (url: string) => url.startsWith(REDIRECT) && url.includes('state=')

  it('handles the cold-start URL and later callbacks once each, and ignores other deep links', async () => {
    const deepLink = fakeDeepLink([`${REDIRECT}?code=cold&state=s`, 'nu.frigear.desktop:/shifts/1'])
    const handled: string[] = []
    const focus = vi.fn()
    const stop = await listenForDeepLinkCallbacks(deepLink.plugin, { isCallbackUrl, onCallback: url => void handled.push(url), focus })

    deepLink.emit([`${REDIRECT}?code=cold&state=s`])
    deepLink.emit(['nu.frigear.desktop:/shifts/2', `${REDIRECT}?code=warm&state=t`])
    deepLink.emit([`${REDIRECT}?code=warm&state=t`])
    expect(handled).toEqual([`${REDIRECT}?code=cold&state=s`, `${REDIRECT}?code=warm&state=t`])
    await Promise.resolve()
    expect(focus).toHaveBeenCalledTimes(2)

    stop()
    expect(deepLink.count()).toBe(0)
  })

  it('does not replay the cold-start URL after a webview reload', async () => {
    const deepLink = fakeDeepLink([`${REDIRECT}?code=cold&state=s`])
    let remembered: string | null = null
    const launchUrlStore = { get: () => remembered, set: (url: string) => void (remembered = url) }
    const handled: string[] = []
    const handlers = { isCallbackUrl, onCallback: (url: string) => void handled.push(url), launchUrlStore }
    ;(await listenForDeepLinkCallbacks(deepLink.plugin, handlers))()
    ;(await listenForDeepLinkCallbacks(deepLink.plugin, handlers))()
    expect(handled).toEqual([`${REDIRECT}?code=cold&state=s`])
  })

  it('survives a failing `getCurrent` and a failing focus', async () => {
    const deepLink = fakeDeepLink()
    deepLink.plugin.getCurrent = async () => {
      throw new Error('not supported')
    }
    const handled: string[] = []
    await listenForDeepLinkCallbacks(deepLink.plugin, {
      isCallbackUrl,
      onCallback: url => void handled.push(url),
      focus: async () => {
        throw new Error('no permission')
      },
    })
    deepLink.emit([`${REDIRECT}?code=a&state=s`])
    expect(handled).toEqual([`${REDIRECT}?code=a&state=s`])
  })
})
