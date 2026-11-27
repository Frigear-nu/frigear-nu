import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../src/runtime/db/schema.sqlite'
import { isSafeRedirect } from '../../src/runtime/utils/redirect'

// A sign-up keeps the `?redirect=` it started from (e.g. `/oauth/authorize?...` of an app's sign-in): the verification
// link lands there, a path on this site only, else on `settings.afterLogin`. Real queries on an in-memory SQLite.
const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })
vi.mock('@nuxthub/db', () => ({ db, schema }))
vi.mock('@frigear-nu/module-kit/server', () => ({
  created: (_event: unknown, body: unknown) => body,
  conflict: (message: string) => new Error(message),
}))

let verifyEmail = true
let codes = 0
const mails: Array<{ to: string, url: string }> = []
const sessions: number[] = []
const users = new Map<string, { id: number, name: string, email: string }>()

vi.stubGlobal('useRuntimeConfig', () => ({ public: { authentication: { verifyEmail } }, authentication: { magicLinkCooldown: 0 } }))
vi.stubGlobal('authSiteOrigin', () => 'https://site.example')
vi.stubGlobal('createOneTimeCode', () => `code${++codes}`)
vi.stubGlobal('isInternalPath', isSafeRedirect)
vi.stubGlobal('getAfterLoginPath', () => '/dashboard')
vi.stubGlobal('dispatchAuthEmail', async (_type: string, to: string, data: { url: string }) => {
  mails.push({ to, url: data.url })
})

const magicLink = await import('../../src/runtime/server/utils/magic-link')
vi.stubGlobal('sendVerificationLink', magicLink.sendVerificationLink)
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('assertAuthSameOrigin', () => {})
vi.stubGlobal('enforceAuthRateLimit', async () => {})
vi.stubGlobal('readValidatedBody', async (event: { body: unknown }, parse: (body: unknown) => unknown) => parse(event.body))
vi.stubGlobal('hashPassword', async (password: string) => `hashed:${password}`)
vi.stubGlobal('startAuthSession', async (_event: unknown, user: { id: number }) => {
  sessions.push(user.id)
})
vi.stubGlobal('useAuthUserStore', () => ({
  findByEmail: async (email: string) => users.get(email),
  create: async (input: { name: string, email: string }) => {
    const user = { id: users.size + 1, name: input.name, email: input.email }
    users.set(input.email, user)
    return user
  },
}))

const { default: register } = await import('../../src/runtime/server/routes/session/register.post') as unknown as {
  default: (event: { body: unknown }) => Promise<{ id: number, verificationRequired: boolean }>
}

const signUp = (redirect?: unknown) => register({ body: { name: 'Ada', email: `ada${users.size}@example.com`, password: 'long enough', redirect } })

/** Where the emailed link lands once followed. */
async function landing() {
  const code = new URL(mails.at(-1)!.url).searchParams.get('code')!
  return (await magicLink.consumeMagicLink(code))?.redirectUrl
}

beforeAll(async () => {
  await client.execute(`CREATE TABLE magic_links (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, userId integer NOT NULL, code text NOT NULL UNIQUE, redirectUrl text, expiresAt integer NOT NULL, usedAt integer, createdAt integer NOT NULL)`)
})

beforeEach(() => {
  verifyEmail = true
  mails.length = 0
  sessions.length = 0
})

describe('sign-up redirect', () => {
  it('lands the verification link on the requested path, query included', async () => {
    const redirect = '/oauth/authorize?client_id=mobile&redirect_uri=nu.frigear.app%3A%2Fauth%2Fcallback&state=s'
    expect(await signUp(redirect)).toMatchObject({ verificationRequired: true })
    expect(sessions).toEqual([])
    expect(await landing()).toBe(redirect)
  })

  it('falls back to `afterLogin` without a redirect', async () => {
    await signUp()
    expect(await landing()).toBe('/dashboard')
  })

  it.each([
    ['a full URL', 'https://evil.test/x'],
    ['protocol-relative', '//evil.test'],
    ['a backslash', '/\\evil.test'],
    ['a relative path', 'account'],
  ])('ignores %s', async (_name, redirect) => {
    expect(await signUp(redirect)).toMatchObject({ verificationRequired: true })
    expect(await landing()).toBe('/dashboard')
  })

  it('refuses a redirect that is not a string', async () => {
    await expect(signUp(['/a'])).rejects.toThrow()
    expect(mails).toEqual([])
  })

  it('signs in at once without email verification, sending no link', async () => {
    verifyEmail = false
    expect(await signUp('/oauth/authorize?client_id=mobile')).toMatchObject({ verificationRequired: false })
    expect(sessions).toHaveLength(1)
    expect(mails).toEqual([])
  })

  it('keeps `afterLogin` for verification links sent without one (staff, resend)', async () => {
    expect(await magicLink.sendVerificationLink({} as never, { id: 99, name: 'Bo', email: 'bo@example.com' })).toBe(true)
    expect(await landing()).toBe('/dashboard')
  })
})
