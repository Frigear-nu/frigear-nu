import type { EmailNotification } from '@frigear-nu/notify/types'

export type AuthEmailType = 'magic-link' | 'verify-email'

export type AuthEmailContext = {
  type: AuthEmailType
  notification: EmailNotification
  /** What the notification was built from, for hosts that render their own template. */
  data: { name: string, url: string }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildMagicLinkNotification({ to, name, url }: { to: string, name: string, url: string }): EmailNotification {
  return {
    to,
    subject: 'Your sign-in link',
    body: `<p>Hi ${escapeHtml(name)},</p><p>Click the link below to sign in. It can be used once and expires in 2 hours.</p>`
      + `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
    text: `Hi ${name},\n\nSign in (single use, expires in 2 hours): ${url}`,
  }
}

export function buildVerifyEmailNotification({ to, name, url }: { to: string, name: string, url: string }): EmailNotification {
  return {
    to,
    subject: 'Welcome! Please verify your email',
    body: `<p>Hi ${escapeHtml(name)},</p><p>Welcome! Click the link below to verify your email address and sign in.</p>`
      + `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
    text: `Hi ${name},\n\nVerify your email address and sign in: ${url}`,
  }
}

/**
 * Builds and dispatches an auth email through @frigear-nu/notify. Hosts can replace the subject/body
 * (e.g. with a branded template) in the `auth:email` hook before it is sent.
 */
export async function dispatchAuthEmail(type: AuthEmailType, to: string, data: AuthEmailContext['data']) {
  const build = type === 'magic-link' ? buildMagicLinkNotification : buildVerifyEmailNotification
  const context: AuthEmailContext = { type, notification: build({ to, ...data }), data }
  await useNitroApp().hooks.callHook('auth:email', context)
  await dispatchEmailNotification(context.notification)
}
