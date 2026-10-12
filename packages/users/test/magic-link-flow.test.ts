import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

const fixture = fileURLToPath(new URL('./fixtures/magic-link-db', import.meta.url))
const dataDir = `${fixture}/.data`
const mailFile = `${dataDir}/mails.jsonl`

type Mail = { to: string, subject: string, text: string }

async function sentMails(): Promise<Mail[]> {
  const raw = await readFile(mailFile, 'utf8').catch(() => '')
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

async function latestLink(to: string) {
  const mail = (await sentMails()).reverse().find(m => m.to === to)
  if (!mail) throw new Error(`No mail to ${to}`)
  const url = new URL(mail.text.match(/https?:\/\/\S+/)![0])
  return url.pathname + url.search
}

const post = (path: string, body: unknown) => fetch(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('magic links & email verification (database)', async () => {
  await rm(dataDir, { recursive: true, force: true })
  process.env.TEST_MAIL_FILE = mailFile
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir: fixture, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  const credentials = { name: 'Ada', email: 'ada@example.com', password: 'supersecret123' }

  it('registering requires verification: no session and no login until the emailed link was followed', async () => {
    const register = await post('/api/auth/register', credentials)
    expect(register.status, await register.clone().text()).toBe(200)
    expect(await register.json()).toMatchObject({ verificationRequired: true })
    expect(register.headers.get('set-cookie')).toBeNull()

    const login = await post('/api/auth/login', { email: credentials.email, password: credentials.password })
    expect(login.status).toBe(403)

    const link = await fetch(await latestLink(credentials.email), { redirect: 'manual' })
    expect(link.status).toBe(302)
    expect(link.headers.get('location')).toBe('/')
    expect(link.headers.get('set-cookie')).toContain('nuxt-session')

    const verified = await post('/api/auth/login', { email: credentials.email, password: credentials.password })
    expect(verified.status, await verified.clone().text()).toBe(200)
  })

  it('a link works once', async () => {
    const path = await latestLink(credentials.email)
    const replay = await fetch(path, { redirect: 'manual' })
    expect(replay.status).toBe(302)
    expect(replay.headers.get('location')).toContain('error=magic-link')
    expect(replay.headers.get('set-cookie')).toBeNull()
  })

  it('answers the same for unknown addresses and sends nothing', async () => {
    const before = (await sentMails()).length
    const unknown = await post('/api/auth/magic-link', { email: 'nobody@example.com' })
    expect(unknown.status).toBe(200)
    expect(await unknown.json()).toEqual({ ok: true })
    expect((await sentMails()).length).toBe(before)
  })

  it('does not re-send within the cooldown, then follows an internal redirect once it passed', async () => {
    const before = (await sentMails()).length

    // The registration link was issued just now, so asking again sends nothing.
    expect((await post('/api/auth/magic-link', { email: credentials.email })).status).toBe(200)
    expect((await sentMails()).length).toBe(before)

    await new Promise(resolve => setTimeout(resolve, 2200))
    expect((await post('/api/auth/magic-link', { email: credentials.email, redirect: '/account' })).status).toBe(200)
    expect((await sentMails()).length).toBe(before + 1)
    expect((await fetch(await latestLink(credentials.email), { redirect: 'manual' })).headers.get('location')).toBe('/account')

    await new Promise(resolve => setTimeout(resolve, 2200))
    await post('/api/auth/magic-link', { email: credentials.email, redirect: 'https://evil.example/' })
    expect((await fetch(await latestLink(credentials.email), { redirect: 'manual' })).headers.get('location')).toBe('/')
  })
})
