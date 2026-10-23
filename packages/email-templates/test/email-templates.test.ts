import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

const fixture = fileURLToPath(new URL('./fixtures/basic', import.meta.url))
const mailFile = `${fixture}/.data/mails.jsonl`

type Mail = { to: string, subject: string, body: string, text?: string, replyTo?: string }

async function lastMail(): Promise<Mail> {
  const lines = (await readFile(mailFile, 'utf8')).split('\n').filter(Boolean)
  return JSON.parse(lines.at(-1)!)
}

describe('email templates', async () => {
  await rm(`${fixture}/.data`, { recursive: true, force: true })
  const { mkdir } = await import('node:fs/promises')
  await mkdir(`${fixture}/.data`, { recursive: true })
  process.env.TEST_MAIL_FILE = mailFile
  afterAll(() => rm(`${fixture}/.data`, { recursive: true, force: true }))

  await setup({ rootDir: fixture })

  it('sendEmailTemplate renders a host template with its subject and plain text', async () => {
    await $fetch('/api/welcome', { method: 'POST' })
    const mail = await lastMail()
    expect(mail).toMatchObject({ to: 'ada@example.com', subject: 'Welcome, Ada', replyTo: 'support@example.com' })
    expect(mail.body).toContain('Hi Ada, welcome aboard.')
    expect(mail.body).toContain('<!DOCTYPE html')
    expect(mail.text).toContain('Hi Ada, welcome aboard.')
    expect(mail.text).not.toContain('<')
  })

  it('renders a module email from the template the module ships', async () => {
    await $fetch('/api/module/fixture-hello', { method: 'POST' })
    const mail = await lastMail()
    expect(mail.subject).toBe('Hello from the module')
    expect(mail.body).toContain('Module template for Ada')
    expect(mail.text).toContain('Module template for Ada')
  })

  it('lets the host override a module template by file name', async () => {
    await $fetch('/api/module/fixture-overridden', { method: 'POST' })
    const mail = await lastMail()
    expect(mail.subject).toBe('Host subject')
    expect(mail.body).toContain('Host version')
    expect(mail.body).not.toContain('Module version')
  })

  it('sends the plain fallback when the template is missing', async () => {
    await $fetch('/api/module/does-not-exist', { method: 'POST' })
    expect(await lastMail()).toMatchObject({ subject: 'Fallback subject', body: '<p>Fallback body</p>', text: 'Fallback text' })
  })

  it('sends the plain fallback when the template fails to render', async () => {
    await $fetch('/api/module/fixture-broken', { method: 'POST' })
    expect(await lastMail()).toMatchObject({ subject: 'Fallback subject', body: '<p>Fallback body</p>' })
  })

  it.each([
    ['auth-magic-link', { name: 'Ada', url: 'https://x.test/l' }, 'Your sign-in link'],
    ['auth-verify-email', { name: 'Ada', url: 'https://x.test/l' }, 'Welcome! Please verify your email'],
    ['auth-password-reset', { url: 'https://x.test/l' }, 'Reset your password'],
    ['users-verify-email-change', { name: 'Ada', url: 'https://x.test/l' }, 'Confirm your new email address'],
    ['users-email-changed', { name: 'Ada', newEmail: 'new@x.test', url: 'https://x.test/l' }, 'Your email address was changed'],
    ['users-password-changed', { name: 'Ada' }, 'Your password was changed'],
    ['subscriptions-payment-link', { name: 'Ada', label: 'Gold', url: 'https://x.test/l' }, 'Complete your Gold membership'],
  ])('renders the built-in %s template', async (name, props, subject) => {
    const rendered = await $fetch<{ subject: string, body: string, text: string }>(`/api/render/${name}`, { method: 'POST', body: props })
    expect(rendered.subject).toBe(subject)
    // The shared layout: configured logo and the footer.
    expect(rendered.body).toContain('src="https://cdn.example.test/logo.png"')
    expect(rendered.body).toContain('alt="Fixture Co"')
    expect(rendered.text).toContain('This email was sent automatically for security reasons.')
    if ('url' in props) {
      expect(rendered.body).toContain('href="https://x.test/l"')
      expect(rendered.text).toContain('https://x.test/l')
    }
  })

  it.each([
    ['users-email-changed', { name: 'Ada', newEmail: 'new@x.test', url: 'https://x.test/l' }],
    ['users-password-changed', { name: 'Ada' }],
  ])('renders the %s security alert in the configured danger colour', async (name, props) => {
    const rendered = await $fetch<{ body: string }>(`/api/render/${name}`, { method: 'POST', body: props })
    expect(rendered.body).toContain('color:#b91c1c')
  })
})
