import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignInFlow, memoryStorage } from '../../src/runtime/core'
import { browserUserAgent, listenForCallbacks, withInstallMarker } from '../../src/runtime/capacitor/adapters'
import { json, setup } from './helpers'

// A native platform with the in-app browser: `Browser.open` resolves once it is shown; the user closing it fires
// `browserFinished`, while the app closing it with `Browser.close()` does not (as on iOS).
const native = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event?: unknown) => void>>()
  return {
    listeners,
    prefs: new Map<string, string>(),
    keychain: new Map<string, string>(),
    opened: [] as string[],
    launchUrl: undefined as string | undefined,
    emit: (event: string, payload?: unknown) => [...(listeners.get(event) ?? [])].forEach(fn => fn(payload)),
    count: (event: string) => listeners.get(event)?.size ?? 0,
  }
})

const addListener = async (event: string, fn: (payload?: unknown) => void) => {
  const set = native.listeners.get(event) ?? new Set()
  native.listeners.set(event, set.add(fn))
  return { remove: async () => void set.delete(fn) }
}

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(async ({ url }: { url: string }) => void native.opened.push(url)),
    close: vi.fn(async () => undefined),
    addListener: vi.fn(addListener),
  },
}))
vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: async () => (native.launchUrl ? { url: native.launchUrl } : undefined),
    addListener: vi.fn(addListener),
  },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: native.prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string, value: string }) => void native.prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void native.prefs.delete(key),
  },
}))

// Mirrors @aparajita/capacitor-secure-storage: `set` stores `JSON.stringify(data)` and `get` parses it, while
// `getItem` returns the raw stored string.
const keychain = {
  get: async (key: string) => native.keychain.has(key) ? JSON.parse(native.keychain.get(key)!) : null,
  getItem: async (key: string) => native.keychain.get(key) ?? null,
  set: async (key: string, data: unknown) => void native.keychain.set(key, JSON.stringify(data)),
  setItem: async (key: string, value: string) => void native.keychain.set(key, value),
  remove: async (key: string) => native.keychain.delete(key),
  removeItem: async (key: string) => void native.keychain.delete(key),
}

const REDIRECT = 'eu.hareland.bills:/auth/callback'

/** A token endpoint that answers only once released, so a test can act while the code exchange is in flight. */
function deferredTokens() {
  let release!: () => void
  const ready = new Promise<void>(resolve => (release = resolve))
  return {
    release,
    handler: async () => {
      await ready
      return json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
    },
  }
}

async function setupFlow() {
  const { Browser } = await import('@capacitor/browser')
  const server = deferredTokens()
  const { client } = setup(server.handler, { redirectUri: REDIRECT })
  const signingIn = { value: false }
  const flow = createSignInFlow(client, { userAgent: browserUserAgent(Browser), onChange: value => (signingIn.value = value) })
  const callbackUrl = () => `${REDIRECT}?code=abc&state=${new URL(native.opened.at(-1)!).searchParams.get('state')}`
  return { client, flow, signingIn, server, callbackUrl }
}

beforeEach(() => {
  native.listeners.clear()
  native.prefs.clear()
  native.keychain.clear()
  native.opened.length = 0
  native.launchUrl = undefined
})

describe('sign-in through the in-app browser', () => {
  it('stops signing in when the user closes the browser, and can sign in again', async () => {
    const { flow, signingIn, server, callbackUrl } = await setupFlow()

    await flow.login()
    expect(signingIn.value).toBe(true)
    expect(native.count('browserFinished')).toBe(1)

    native.emit('browserFinished')
    expect(signingIn.value).toBe(false)
    expect(native.count('browserFinished')).toBe(0)

    await flow.login()
    expect(signingIn.value).toBe(true)
    expect(native.opened).toHaveLength(2)
    server.release()
    await flow.complete(callbackUrl())
    expect(signingIn.value).toBe(false)
    expect(native.count('browserFinished')).toBe(0)
  })

  it('finishes a sign-in whose browser closes while the code is being exchanged', async () => {
    const { client, flow, signingIn, server, callbackUrl } = await setupFlow()
    await flow.login()

    const completing = flow.complete(callbackUrl())
    native.emit('browserFinished')
    expect(signingIn.value).toBe(true)

    server.release()
    await completing
    expect(await client.isAuthenticated()).toBe(true)
    expect(signingIn.value).toBe(false)
    expect(native.count('browserFinished')).toBe(0)
  })

  it('still completes when the browser is closed just before the redirect arrives', async () => {
    const { client, flow, signingIn, server, callbackUrl } = await setupFlow()
    await flow.login()

    native.emit('browserFinished')
    expect(signingIn.value).toBe(false)

    server.release()
    await flow.complete(callbackUrl())
    expect(await client.isAuthenticated()).toBe(true)
    expect(signingIn.value).toBe(false)
  })

  it('clears the state and the listener when the browser cannot open', async () => {
    const { flow, signingIn } = await setupFlow()
    const { Browser } = await import('@capacitor/browser')
    vi.mocked(Browser.open).mockRejectedValueOnce(new Error('Unable to display URL'))

    await expect(flow.login()).rejects.toThrow('Unable to display URL')
    expect(signingIn.value).toBe(false)
    expect(native.count('browserFinished')).toBe(0)
  })
})

describe('listenForCallbacks', () => {
  it('handles the cold-start URL and later callbacks once each, and ignores other deep links', async () => {
    const { App } = await import('@capacitor/app')
    native.launchUrl = `${REDIRECT}?code=cold&state=s`
    const handled: string[] = []
    const resumed = vi.fn()
    const stop = await listenForCallbacks(App, {
      isCallbackUrl: url => url.startsWith(REDIRECT) && url.includes('state='),
      onCallback: url => void handled.push(url),
      onResume: resumed,
    })

    native.emit('appUrlOpen', { url: `${REDIRECT}?code=cold&state=s` })
    native.emit('appUrlOpen', { url: 'eu.hareland.bills:/bills/42' })
    native.emit('appUrlOpen', { url: `${REDIRECT}?code=warm&state=t` })
    native.emit('resume')
    expect(handled).toEqual([`${REDIRECT}?code=cold&state=s`, `${REDIRECT}?code=warm&state=t`])
    expect(resumed).toHaveBeenCalledOnce()

    stop()
    await Promise.resolve()
    expect(native.count('appUrlOpen')).toBe(0)
  })

  it('does not replay the cold-start URL after a webview reload', async () => {
    const { App } = await import('@capacitor/app')
    native.launchUrl = `${REDIRECT}?code=cold&state=s`
    let remembered: string | null = null
    const launchUrlStore = { get: () => remembered, set: (url: string) => void (remembered = url) }
    const handled: string[] = []
    const handlers = { isCallbackUrl: () => true, onCallback: (url: string) => void handled.push(url), launchUrlStore }
    ;(await listenForCallbacks(App, handlers))()
    ;(await listenForCallbacks(App, handlers))()
    expect(handled).toEqual([`${REDIRECT}?code=cold&state=s`])
  })
})

describe('withInstallMarker', () => {
  it('wipes Keychain tokens left over from a previous install, once', async () => {
    const secure = memoryStorage()
    await secure.set('oauth:app:tokens', 'stale')
    const marker = memoryStorage()
    const storage = withInstallMarker(secure, { marker, keys: ['oauth:app:tokens'] })

    expect(await storage.get('oauth:app:tokens')).toBeNull()
    await storage.set('oauth:app:tokens', 'fresh')
    expect(await marker.get('oauth-client:installed')).toBeTruthy()

    // Next launch: the marker is there, the tokens stay.
    const relaunched = withInstallMarker(secure, { marker, keys: ['oauth:app:tokens'] })
    expect(await relaunched.get('oauth:app:tokens')).toBe('fresh')
  })
})

describe('createCapacitorOAuthClient', () => {
  it('keeps tokens in secure storage and the pending authorization in Preferences', async () => {
    const { createCapacitorOAuthClient } = await import('../../src/runtime/capacitor')
    const client = createCapacitorOAuthClient({
      issuer: 'https://id.example.test',
      clientId: 'app',
      redirectUri: REDIRECT,
      discovery: false,
      secureStorage: keychain,
      fetch: async () => json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }),
    })

    await client.authorize()
    expect(native.opened).toHaveLength(1)
    expect(native.prefs.has('oauth:app:pending')).toBe(true)
    const state = new URL(native.opened[0]!).searchParams.get('state')
    await client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)

    expect(JSON.parse(JSON.parse(native.keychain.get('oauth:app:tokens')!)).accessToken).toBe('access-1')
    expect(native.prefs.has('oauth:app:tokens')).toBe(false)
    expect(native.prefs.has('oauth:app:installed')).toBe(true)
    // The tokens read back as tokens: the session survives the first use.
    expect(await client.getAccessToken()).toBe('access-1')
    expect(await client.isAuthenticated()).toBe(true)
  })
})
