import { fileURLToPath } from 'node:url'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

const fixture = fileURLToPath(new URL('./fixtures/verified-email-change', import.meta.url))
const dataDir = `${fixture}/.data`
const mailFile = `${dataDir}/mails.jsonl`

type Mail = { to: string, subject: string, text: string }

async function sentMails(): Promise<Mail[]> {
  const raw = await readFile(mailFile, 'utf8').catch(() => '')
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

// The path of the link in the latest mail to `to`.
async function linkTo(to: string, pattern: RegExp) {
  const mail = (await sentMails()).reverse().find(m => m.to === to && pattern.test(m.text))
  if (!mail) throw new Error(`No mail to ${to} matching ${pattern}`)
  const url = mail.text.match(/https?:\/\/\S+/)![0]
  return new URL(url).pathname + new URL(url).search
}

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

async function register(name: string, email: string) {
  const response = await post('/api/auth/register', { name, email, password: 'supersecret123' })
  expect(response.status, await response.clone().text()).toBe(200)
  return response.headers.get('set-cookie')!
}

describe('verified email change', async () => {
  await rm(dataDir, { recursive: true, force: true })
  process.env.TEST_MAIL_FILE = mailFile
  // The file's folder is created by the database; make sure the file exists up front.
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir: fixture, dev: true })
  await writeFile(mailFile, '').catch(() => {})

  it('only applies the new address once it was confirmed, and can be reverted from the old one', async () => {
    const cookie = await register('Ada', 'ada@example.com')

    const request = await post('/api/account/change-email', { email: 'ada-new@example.com' }, cookie)
    expect(request.status, await request.clone().text()).toBe(200)
    expect(await request.json()).toMatchObject({ verificationRequired: true })

    // Nothing changed yet: the old address still logs in, the new one doesn't exist.
    expect((await post('/api/auth/login', { email: 'ada@example.com', password: 'supersecret123' })).status).toBe(200)
    expect((await post('/api/auth/login', { email: 'ada-new@example.com', password: 'supersecret123' })).status).toBe(401)

    const confirm = await fetch(await linkTo('ada-new@example.com', /verify-email-change/), { redirect: 'manual' })
    expect(confirm.status).toBe(302)
    expect(confirm.headers.get('location')).toContain('email-changed=1')

    expect((await post('/api/auth/login', { email: 'ada-new@example.com', password: 'supersecret123' })).status).toBe(200)

    // The old address is told, and the link can't be used twice.
    const revertPath = await linkTo('ada@example.com', /revert-email-change/)
    expect((await fetch(await linkTo('ada-new@example.com', /verify-email-change/), { redirect: 'manual' })).headers.get('location')).toContain('error=email-change')

    const revert = await fetch(revertPath, { redirect: 'manual' })
    expect(revert.status).toBe(302)
    expect(revert.headers.get('location')).toContain('email-reverted=1')
    expect((await post('/api/auth/login', { email: 'ada@example.com', password: 'supersecret123' })).status).toBe(200)
    expect((await post('/api/auth/login', { email: 'ada-new@example.com', password: 'supersecret123' })).status).toBe(401)

    const again = await fetch(revertPath, { redirect: 'manual' })
    expect(again.headers.get('location')).toContain('error=email-revert')
  })

  it('rejects unknown confirmation codes', async () => {
    const response = await fetch('/auth/verify-email-change?code=nope', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('error=email-change')
  })

  it('tells the user when their password was changed', async () => {
    const cookie = await register('Grace', 'grace@example.com')
    const response = await post('/api/account/change-password', {
      currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'new-password123',
    }, cookie)
    expect(response.status, await response.clone().text()).toBe(200)

    const mails = await sentMails()
    expect(mails.some(mail => mail.to === 'grace@example.com' && mail.subject === 'Your password was changed')).toBe(true)
  })
})
