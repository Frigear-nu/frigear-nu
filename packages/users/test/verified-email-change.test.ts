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

  await setup({ rootDir: fixture, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })
  await writeFile(mailFile, '').catch(() => {})

  const login = (email: string) => post('/api/auth/login', { email, password: 'supersecret123' })
  const codeOf = (path: string) => new URL(path, 'http://localhost').searchParams.get('code')!
  async function preview(path: string, cookie?: string) {
    const response = await fetch(path, { headers: cookie ? { cookie } : {} })
    expect(response.status, await response.clone().text()).toBe(200)
    return response.json()
  }

  it('only applies the new address once its owner confirmed it, and can be reverted from the old one', async () => {
    const cookie = await register('Ada', 'ada@example.com')

    const request = await post('/api/users/me/change-email', { email: 'ada-new@example.com' }, cookie)
    expect(request.status, await request.clone().text()).toBe(200)
    expect(await request.json()).toMatchObject({ verificationRequired: true })

    // Nothing changed yet: the old address still logs in, the new one doesn't exist.
    expect((await login('ada@example.com')).status).toBe(200)
    expect((await login('ada-new@example.com')).status).toBe(401)

    const verifyPath = await linkTo('ada-new@example.com', /verify-email-change/)
    expect(verifyPath).toMatch(/^\/auth\/verify-email-change\?code=/)
    const code = codeOf(verifyPath)

    // Opening the link signed out (a mail scanner, a link preview, another browser) sends you to sign in, says why
    // and comes back to the link. That, and reading the preview, change nothing.
    const opened = await fetch(verifyPath, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    const signIn = new URL(opened.headers.get('location')!, 'http://localhost')
    expect(signIn.pathname).toBe('/login')
    expect(signIn.searchParams.get('redirect')).toBe(verifyPath)
    expect(signIn.searchParams.get('reason')).toBe('users.emailChange')
    expect(opened.headers.get('set-cookie')).toBeNull()
    // Signed in as the owner, the link opens the page.
    expect((await fetch(verifyPath, { redirect: 'manual', headers: { cookie } })).status).toBe(200)
    expect(await preview(`/api/users/email-change?code=${code}`)).toEqual({
      status: 'pending', signedIn: false, owner: false, newEmail: 'ada-new@example.com', oldEmail: 'a***@example.com',
    })
    expect(await preview(`/api/users/email-change?code=${code}`, cookie)).toMatchObject({
      status: 'pending', signedIn: true, owner: true, oldEmail: 'ada@example.com',
    })
    expect((await login('ada-new@example.com')).status).toBe(401)

    // Confirming needs a browser session of the account that asked for the change.
    expect((await post('/api/users/email-change/confirm', { code })).status).toBe(401)
    const other = await register('Bob', 'bob@example.com')
    expect(await preview(`/api/users/email-change?code=${code}`, other)).toMatchObject({ owner: false, oldEmail: 'a***@example.com' })
    expect((await post('/api/users/email-change/confirm', { code }, other)).status).toBe(403)
    expect((await login('ada-new@example.com')).status).toBe(401)
    expect(await preview(`/api/users/email-change?code=${code}`)).toMatchObject({ status: 'pending' })

    const confirm = await post('/api/users/email-change/confirm', { code }, cookie)
    expect(confirm.status, await confirm.clone().text()).toBe(200)
    expect(await confirm.json()).toMatchObject({ email: 'ada-new@example.com' })
    expect(confirm.headers.get('set-cookie')).toContain('nuxt-session')

    expect((await login('ada-new@example.com')).status).toBe(200)

    // The link can't be used twice.
    expect((await post('/api/users/email-change/confirm', { code }, cookie)).status).toBe(400)
    expect(await preview(`/api/users/email-change?code=${code}`)).toMatchObject({ status: 'confirmed' })
    // A used link says so on the page, without asking to sign in.
    expect((await fetch(verifyPath, { redirect: 'manual' })).status).toBe(200)

    // The old address is told, with a link that works signed out, once, and only through the POST.
    const revertPath = await linkTo('ada@example.com', /revert-email-change/)
    expect(revertPath).toMatch(/^\/auth\/revert-email-change\?code=/)
    const revertCode = codeOf(revertPath)
    expect((await fetch(revertPath, { redirect: 'manual' })).headers.get('set-cookie')).toBeNull()
    expect(await preview(`/api/users/email-change/revert?code=${revertCode}`)).toEqual({
      status: 'pending', oldEmail: 'ada@example.com', newEmail: 'ada-new@example.com',
    })
    expect((await login('ada-new@example.com')).status).toBe(200)

    const revert = await post('/api/users/email-change/revert', { code: revertCode })
    expect(revert.status, await revert.clone().text()).toBe(200)
    expect(await revert.json()).toEqual({ email: 'ada@example.com', signedOut: false })
    expect((await login('ada@example.com')).status).toBe(200)
    expect((await login('ada-new@example.com')).status).toBe(401)

    expect((await post('/api/users/email-change/revert', { code: revertCode })).status).toBe(400)
    expect(await preview(`/api/users/email-change/revert?code=${revertCode}`)).toMatchObject({ status: 'reverted' })
  })

  it('rejects unknown codes', async () => {
    expect((await fetch('/api/users/email-change?code=nope')).status).toBe(404)
    expect((await fetch('/api/users/email-change/revert?code=nope')).status).toBe(404)
    const cookie = await register('Linus', 'linus@example.com')
    expect((await post('/api/users/email-change/confirm', { code: 'nope' }, cookie)).status).toBe(400)
    expect((await post('/api/users/email-change/revert', { code: 'nope' })).status).toBe(400)
  })

  it('tells the user when their password was changed', async () => {
    const cookie = await register('Grace', 'grace@example.com')
    const response = await post('/api/users/me/change-password', {
      currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'new-password123',
    }, cookie)
    expect(response.status, await response.clone().text()).toBe(200)

    const mails = await sentMails()
    expect(mails.some(mail => mail.to === 'grace@example.com' && mail.subject === 'Your password was changed')).toBe(true)
  })
})
