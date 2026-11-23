import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../src/runtime/db/schema.sqlite'

// How long emailed links stay valid: a sign-in link 2 hours, an invite (staff created the account) the configured
// `settings.inviteTtl` (7 days by default). Every link is single-use. Runs the real queries on an in-memory SQLite.
const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })
vi.mock('@nuxthub/db', () => ({ db, schema }))

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let config: { public: { siteUrl: string }, authentication: { magicLinkCooldown: number, inviteTtl?: number } }
const mails: Array<{ type: string, to: string, url: string }> = []
let codes = 0
vi.stubGlobal('useRuntimeConfig', () => config)
vi.stubGlobal('authSiteOrigin', () => 'https://site.example')
vi.stubGlobal('createOneTimeCode', () => `code${++codes}`)
vi.stubGlobal('isInternalPath', () => true)
vi.stubGlobal('getAfterLoginPath', () => '/')
vi.stubGlobal('dispatchAuthEmail', async (type: string, to: string, data: { url: string }) => {
  mails.push({ type, to, url: data.url })
})

const { createMagicLink, consumeMagicLink, sendVerificationLink } = await import('../../src/runtime/server/utils/magic-link')

const event = {} as never
const user = { id: 1, name: 'Ada', email: 'ada@example.com' }
const codeOf = (url: string) => new URL(url).searchParams.get('code')!

beforeAll(async () => {
  await client.execute(`CREATE TABLE magic_links (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, userId integer NOT NULL, code text NOT NULL UNIQUE, redirectUrl text, expiresAt integer NOT NULL, usedAt integer, createdAt integer NOT NULL)`)
})

beforeEach(async () => {
  config = { public: { siteUrl: 'https://site.example' }, authentication: { magicLinkCooldown: 0 } }
  mails.length = 0
  await client.execute('DELETE FROM magic_links')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('magic link lifetime', () => {
  it('expires a sign-in link after 2 hours', async () => {
    const link = await createMagicLink(event, { userId: 1 })
    vi.setSystemTime(Date.now() + 2 * HOUR + 60_000)
    expect(await consumeMagicLink(link!.code)).toBeUndefined()
  })

  it('accepts a sign-in link within 2 hours, once', async () => {
    const link = await createMagicLink(event, { userId: 1 })
    vi.setSystemTime(Date.now() + 2 * HOUR - 60_000)
    expect(await consumeMagicLink(link!.code)).toMatchObject({ userId: 1 })
    expect(await consumeMagicLink(link!.code)).toBeUndefined()
  })

  it('expires the verification link of a self sign-up after 2 hours', async () => {
    expect(await sendVerificationLink(event, user)).toBe(true)
    vi.setSystemTime(Date.now() + 2 * HOUR + 60_000)
    expect(await consumeMagicLink(codeOf(mails[0]!.url))).toBeUndefined()
  })

  it('keeps an invite link valid after 2 hours, and single-use', async () => {
    expect(await sendVerificationLink(event, user, { invite: true })).toBe(true)
    expect(mails).toEqual([{ type: 'verify-email', to: 'ada@example.com', url: expect.stringContaining('/auth/magic-link?code=v') }])
    vi.setSystemTime(Date.now() + 2 * HOUR + 60_000)
    const code = codeOf(mails[0]!.url)
    expect(await consumeMagicLink(code)).toMatchObject({ userId: 1 })
    expect(await consumeMagicLink(code)).toBeUndefined()
  })

  it('expires an invite link after 7 days by default', async () => {
    await sendVerificationLink(event, user, { invite: true })
    vi.setSystemTime(Date.now() + 7 * DAY + 60_000)
    expect(await consumeMagicLink(codeOf(mails[0]!.url))).toBeUndefined()
  })

  it('follows `settings.inviteTtl`', async () => {
    config.authentication.inviteTtl = DAY / 1000
    await sendVerificationLink(event, user, { invite: true })
    vi.setSystemTime(Date.now() + DAY + 60_000)
    expect(await consumeMagicLink(codeOf(mails[0]!.url))).toBeUndefined()
  })
})
