import { fileURLToPath } from 'node:url'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { usersApi } from '../src/runtime/utils/api'

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

// The `name=value` of the session cookie a response set.
const sessionOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]!

const post = (path: string, body: unknown, cookie?: string) => apiClient({ cookie }).fetch('POST', path, body)
const put = (path: string, body: unknown, cookie?: string) => apiClient({ cookie }).fetch('PUT', path, body)

async function register(name: string, email: string) {
  const response = await post(authApi.register, { name, email, password: 'supersecret123' })
  expect(response.status, await response.clone().text()).toBe(201)
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

  const login = (email: string) => post(authApi.login, { email, password: 'supersecret123' })
  const codeOf = (path: string) => new URL(path, 'http://localhost').searchParams.get('code')!
  async function preview(path: string, cookie?: string) {
    const response = await fetch(path, { headers: cookie ? { cookie } : {} })
    expect(response.status, await response.clone().text()).toBe(200)
    return response.json()
  }

  it('only applies the new address once its owner confirmed it, and can be reverted from the old one', async () => {
    const cookie = await register('Ada', 'ada@example.com')

    const request = await put(usersApi.me.email, { email: 'ada-new@example.com' }, cookie)
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
    expect(await preview(`${usersApi.emailChange}?code=${code}`)).toEqual({
      status: 'pending', signedIn: false, owner: false, newEmail: 'ada-new@example.com', oldEmail: 'a***@example.com',
    })
    expect(await preview(`${usersApi.emailChange}?code=${code}`, cookie)).toMatchObject({
      status: 'pending', signedIn: true, owner: true, oldEmail: 'ada@example.com',
    })
    expect((await login('ada-new@example.com')).status).toBe(401)

    // Confirming needs a browser session of the account that asked for the change.
    expect((await post(usersApi.emailChangeConfirm, { code })).status).toBe(401)
    const other = await register('Bob', 'bob@example.com')
    expect(await preview(`${usersApi.emailChange}?code=${code}`, other)).toMatchObject({ owner: false, oldEmail: 'a***@example.com' })
    expect((await post(usersApi.emailChangeConfirm, { code }, other)).status).toBe(403)
    expect((await login('ada-new@example.com')).status).toBe(401)
    expect(await preview(`${usersApi.emailChange}?code=${code}`)).toMatchObject({ status: 'pending' })

    const confirm = await post(usersApi.emailChangeConfirm, { code }, cookie)
    expect(confirm.status, await confirm.clone().text()).toBe(200)
    expect(await confirm.json()).toMatchObject({ email: 'ada-new@example.com' })
    expect(confirm.headers.get('set-cookie')).toContain('nuxt-session')

    expect((await login('ada-new@example.com')).status).toBe(200)

    // The link can't be used twice (from the session the confirmation re-issued with the new address).
    expect((await post(usersApi.emailChangeConfirm, { code }, sessionOf(confirm))).status).toBe(400)
    expect(await preview(`${usersApi.emailChange}?code=${code}`)).toMatchObject({ status: 'confirmed' })
    // A used link says so on the page, without asking to sign in.
    expect((await fetch(verifyPath, { redirect: 'manual' })).status).toBe(200)

    // The old address is told, with a link that works signed out, once, and only through the POST.
    const revertPath = await linkTo('ada@example.com', /revert-email-change/)
    expect(revertPath).toMatch(/^\/auth\/revert-email-change\?code=/)
    const revertCode = codeOf(revertPath)
    expect((await fetch(revertPath, { redirect: 'manual' })).headers.get('set-cookie')).toBeNull()
    expect(await preview(`${usersApi.emailChangeRevert}?code=${revertCode}`)).toEqual({
      status: 'pending', oldEmail: 'ada@example.com', newEmail: 'ada-new@example.com',
    })
    expect((await login('ada-new@example.com')).status).toBe(200)

    const revert = await post(usersApi.emailChangeRevert, { code: revertCode })
    expect(revert.status, await revert.clone().text()).toBe(200)
    expect(await revert.json()).toEqual({ email: 'ada@example.com', signedOut: false })
    expect((await login('ada@example.com')).status).toBe(200)
    expect((await login('ada-new@example.com')).status).toBe(401)

    expect((await post(usersApi.emailChangeRevert, { code: revertCode })).status).toBe(400)
    expect(await preview(`${usersApi.emailChangeRevert}?code=${revertCode}`)).toMatchObject({ status: 'reverted' })
  })

  it('rejects unknown codes', async () => {
    expect((await fetch(`${usersApi.emailChange}?code=nope`)).status).toBe(404)
    expect((await fetch(`${usersApi.emailChangeRevert}?code=nope`)).status).toBe(404)
    const cookie = await register('Linus', 'linus@example.com')
    expect((await post(usersApi.emailChangeConfirm, { code: 'nope' }, cookie)).status).toBe(400)
    expect((await post(usersApi.emailChangeRevert, { code: 'nope' })).status).toBe(400)
  })

  it('tells the user when their password was changed', async () => {
    const cookie = await register('Grace', 'grace@example.com')
    const response = await put(usersApi.me.password, {
      currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'new-password123',
    }, cookie)
    expect(response.status, await response.clone().text()).toBe(200)

    const mails = await sentMails()
    expect(mails.some(mail => mail.to === 'grace@example.com' && mail.subject === 'Your password was changed')).toBe(true)
  })

  describe('ending sessions on a credential change', () => {
    const tokens = (cookie: string) => apiClient({ cookie }).fetch('GET', authApi.me.tokens)
    const signedInAs = async (cookie: string) => (await tokens(cookie)).status

    it('ends the other sessions when the password changes, and keeps the one that changed it', async () => {
      const changer = sessionOf(await post(authApi.register, { name: 'Hedy', email: 'hedy@example.com', password: 'supersecret123' }))
      const elsewhere = sessionOf(await login('hedy@example.com'))
      expect(await signedInAs(elsewhere)).toBe(200)

      const response = await put(usersApi.me.password, {
        currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'new-password123',
      }, changer)
      expect(response.status, await response.clone().text()).toBe(200)

      expect(await signedInAs(sessionOf(response))).toBe(200)
      expect(await signedInAs(elsewhere)).toBe(401)
      // Signing in again works as usual.
      expect(await signedInAs(sessionOf(await post(authApi.login, { email: 'hedy@example.com', password: 'new-password123' })))).toBe(200)
    })

    it('gives the account back when the owner undoes an email change made from another session', async () => {
      const owner = sessionOf(await post(authApi.register, { name: 'Mary', email: 'mary@example.com', password: 'supersecret123' }))
      // A second session of the account, in someone else's hands.
      const other = sessionOf(await login('mary@example.com'))
      const kept = await apiClient({ cookie: other }).json<{ token: string }>('POST', authApi.me.tokens, { name: 'kept', scopes: ['*'] })
      const bootstrap = () => apiClient({ bearer: kept.token }).fetch('GET', `${authApi.bootstrap}?scope=account`)

      expect((await put(usersApi.me.email, { email: 'mary-other@example.com' }, other)).status).toBe(200)
      const confirm = await post(usersApi.emailChangeConfirm, { code: codeOf(await linkTo('mary-other@example.com', /verify-email-change/)) }, other)
      expect(confirm.status, await confirm.clone().text()).toBe(200)
      const changed = sessionOf(confirm)
      // The change ended the owner's session.
      expect(await signedInAs(owner)).toBe(401)

      // The owner undoes it from the old address: every session that came from the change ends, its tokens too.
      const revertCode = codeOf(await linkTo('mary@example.com', /revert-email-change/))
      expect((await post(usersApi.emailChangeRevert, { code: revertCode })).status).toBe(200)
      expect(await signedInAs(changed)).toBe(401)
      expect((await put(usersApi.me.email, { email: 'mary-again@example.com' }, changed)).status).toBe(401)
      expect((await bootstrap()).status).toBe(401)

      // The owner signs in again. A new change names the stored address as the old one, and tells that address.
      const back = sessionOf(await login('mary@example.com'))
      expect((await put(usersApi.me.email, { email: 'mary-new@example.com' }, back)).status).toBe(200)
      const confirmed = await post(usersApi.emailChangeConfirm, { code: codeOf(await linkTo('mary-new@example.com', /verify-email-change/)) }, back)
      expect(confirmed.status, await confirmed.clone().text()).toBe(200)
      expect(codeOf(await linkTo('mary@example.com', /revert-email-change/))).not.toBe(revertCode)
      expect((await sentMails()).some(mail => mail.to === 'mary-other@example.com' && /revert-email-change/.test(mail.text))).toBe(false)
    })

    it('ends every session and revokes the API tokens when the password is reset', async () => {
      const cookie = sessionOf(await post(authApi.register, { name: 'Katherine', email: 'katherine@example.com', password: 'supersecret123' }))
      const created = await apiClient({ cookie }).json<{ token: string }>('POST', authApi.me.tokens, { name: 'CI', scopes: ['*'] })
      const bootstrap = () => apiClient({ bearer: created.token }).fetch('GET', `${authApi.bootstrap}?scope=account`)
      expect((await bootstrap()).status).not.toBe(401)

      expect((await post(authApi.forgotPassword, { email: 'katherine@example.com' })).status).toBe(200)
      const code = codeOf(await linkTo('katherine@example.com', /reset-password/))
      const reset = await post(authApi.resetPassword, { code, password: 'new-password123', confirmPassword: 'new-password123' })
      expect(reset.status, await reset.clone().text()).toBe(200)

      expect(await signedInAs(sessionOf(reset))).toBe(200)
      expect(await signedInAs(cookie)).toBe(401)
      expect((await bootstrap()).status).toBe(401)
    })
  })
})
