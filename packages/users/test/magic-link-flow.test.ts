import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { authApi } from '@frigear-nu/auth/utils'

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
  return { path: url.pathname + url.search, code: url.searchParams.get('code')! }
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
    const register = await post(authApi.register, credentials)
    expect(register.status, await register.clone().text()).toBe(201)
    expect(await register.json()).toMatchObject({ verificationRequired: true })
    expect(register.headers.get('set-cookie')).toBeNull()

    const login = await post(authApi.login, { email: credentials.email, password: credentials.password })
    expect(login.status).toBe(403)

    const { path, code } = await latestLink(credentials.email)
    expect(path).toMatch(/^\/auth\/magic-link\?code=/)

    // Opening the link (a mail scanner, a link preview) neither signs in nor uses it up.
    const opened = await fetch(path, { redirect: 'manual' })
    expect(opened.headers.get('set-cookie')).toBeNull()
    expect((await post(authApi.login, { email: credentials.email, password: credentials.password })).status).toBe(403)

    const confirmed = await post(authApi.magicLinkConfirm, { code })
    expect(confirmed.status, await confirmed.clone().text()).toBe(200)
    expect(await confirmed.json()).toEqual({ redirect: '/' })
    expect(confirmed.headers.get('set-cookie')).toContain('nuxt-session')

    const verified = await post(authApi.login, { email: credentials.email, password: credentials.password })
    expect(verified.status, await verified.clone().text()).toBe(200)
  })

  it('a link works once', async () => {
    const { code } = await latestLink(credentials.email)
    const replay = await post(authApi.magicLinkConfirm, { code })
    expect(replay.status).toBe(400)
    expect(replay.headers.get('set-cookie')).toBeNull()
  })

  it('answers the same for unknown addresses and sends nothing', async () => {
    const before = (await sentMails()).length
    const unknown = await post(authApi.magicLink, { email: 'nobody@example.com' })
    expect(unknown.status).toBe(200)
    expect(await unknown.json()).toEqual({ ok: true })
    expect((await sentMails()).length).toBe(before)
  })

  it('does not re-send within the cooldown, then follows an internal redirect once it passed', async () => {
    const before = (await sentMails()).length

    // The registration link was issued just now, so asking again sends nothing.
    expect((await post(authApi.magicLink, { email: credentials.email })).status).toBe(200)
    expect((await sentMails()).length).toBe(before)

    await new Promise(resolve => setTimeout(resolve, 2200))
    expect((await post(authApi.magicLink, { email: credentials.email, redirect: '/account' })).status).toBe(200)
    expect((await sentMails()).length).toBe(before + 1)
    expect(await (await post(authApi.magicLinkConfirm, { code: (await latestLink(credentials.email)).code })).json()).toEqual({ redirect: '/account' })

    await new Promise(resolve => setTimeout(resolve, 2200))
    await post(authApi.magicLink, { email: credentials.email, redirect: 'https://evil.example/' })
    expect(await (await post(authApi.magicLinkConfirm, { code: (await latestLink(credentials.email)).code })).json()).toEqual({ redirect: '/' })
  })
})
