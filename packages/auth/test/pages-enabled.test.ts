import { request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch, url } from '@nuxt/test-utils/e2e'
import { filesContaining, outputDir } from './utils/output'

describe('login/register pages (opt-in)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/pages-enabled', import.meta.url)),
  })

  it('renders the login page at the default path', async () => {
    const html = await $fetch('/login')
    expect(html).toContain('Log in')
  })

  it('renders the register page at the default path', async () => {
    const html = await $fetch('/register')
    expect(html).toContain('Sign up')
  })

  it('renders a confirm page for the emailed magic link instead of signing in on GET', async () => {
    const response = await fetch('/auth/magic-link?code=abc', { redirect: 'manual' })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).toContain('Continue signing in')
  })

  it('tells guests sent from a protected page why they have to sign in', async () => {
    const generic = await $fetch<string>('/login?redirect=/account')
    expect(generic).toContain('You need to be signed in to do this')
    expect(generic).toContain('Afterwards you are sent straight back to where you were.')
    expect(await $fetch('/login')).not.toContain('You need to be signed in to do this')
    // A reason without strings (or not a key at all) falls back to the generic text.
    expect(await $fetch('/login?redirect=/account&reason=nope.missing')).toContain('You need to be signed in to do this')
    expect(await $fetch('/login?redirect=/account&reason=..%2F')).toContain('You need to be signed in to do this')
  })

  it('publishes the anonymous entry points it owns, for route guards to let through', async () => {
    const html = await $fetch<string>('/login')
    expect(html).toContain('mode:"server"')
    expect(html).toContain('publicPaths:["/login","/register","/forgot-password","/reset-password","/auth/**","/api/auth/**","/api/_auth/**"]')
  })

  // Bundle exclusion is an acceptance test: server mode ships none of the client mode.
  it('ships none of the client mode to the browser', () => {
    expect(filesContaining(outputDir('public'), /auth-client:|Signing you in…|AuthClientLoginPage/)).toEqual([])
  })

  it('sends the caller\'s credentials through `$api` / `useApi` to this app only', async () => {
    const html = await $fetch<string>('/api-check', { headers: { cookie: 'probe=1', authorization: 'Bearer probe' } })
    const json = /<pre id="result">([\s\S]*?)<\/pre>/.exec(html)?.[1]?.replaceAll('&quot;', '"')
    const result = JSON.parse(json!)
    const forwarded = { cookie: expect.stringContaining('probe=1'), authorization: 'Bearer probe' }
    const none = { cookie: null, authorization: null }
    expect(result.own).toEqual(forwarded)
    expect(result.ownUrl).toEqual(forwarded)
    expect(result.ownUrlObject).toEqual(forwarded)
    expect(result.ownRequest).toEqual(none)
    expect(result.other).toEqual(none)
    expect(result.otherBase).toEqual(none)
    expect(result.otherByHook).toEqual(none)
    expect(result.ownHeaders).toEqual({ cookie: expect.stringContaining('probe=1'), authorization: 'Bearer service' })
    expect(result.refused).toBe(401)
    expect(result.useApi.cookie).toContain('probe=1')
  })

  it('keeps the client-mode `useAuth()` contract, without an OAuth client', async () => {
    const html = await $fetch<string>('/api-check')
    const result = JSON.parse(/<pre id="result">([\s\S]*?)<\/pre>/.exec(html)![1]!.replaceAll('&quot;', '"'))
    expect(result.contract).toEqual({
      status: 'signed-out',
      authenticated: false,
      signingIn: false,
      token: null,
      callback: false,
      complete: expect.stringContaining('client mode only'),
    })
  })

  it('keeps forwarded credentials in-process when the Host header names another host', async () => {
    // `fetch` will not send another Host header; a raw request can.
    const html = await new Promise<string>((resolve, reject) => {
      const req = request(url('/api-host-check'), { headers: { host: 'evil.invalid', cookie: 'probe=1', authorization: 'Bearer probe' } }, (res) => {
        let body = ''
        res.on('data', chunk => (body += chunk))
        res.on('end', () => resolve(body))
      })
      req.on('error', reject)
      req.end()
    })
    const result = JSON.parse(/<pre id="result">([\s\S]*?)<\/pre>/.exec(html)![1]!.replaceAll('&quot;', '"'))
    // Fetched over the network, these would have failed (or reached that host): they were served in-process.
    expect(result.origin).toBe('http://evil.invalid')
    const forwarded = { cookie: expect.stringContaining('probe=1'), authorization: 'Bearer probe' }
    expect(result.ownUrl).toEqual(forwarded)
    expect(result.ownUrlObject).toEqual(forwarded)
    expect(result.ownBase).toEqual(forwarded)
  })

  it('ends the session and goes to the login page on a 401 from the app while signed in', async () => {
    const signIn = await fetch('/api/test/sign-in', { method: 'POST' })
    expect(signIn.status, await signIn.clone().text()).toBe(200)
    const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!
    expect(await $fetch('/api/_auth/session', { headers: { cookie } })).toHaveProperty('user')
    const response = await fetch('/refuse-check', { headers: { cookie }, redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login?redirect=/refuse-check')
    // The session cookie is cleared in the same response.
    expect(response.headers.get('set-cookie')).toMatch(/nuxt-session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/)
  })
})
