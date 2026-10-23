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
    template: { name: 'auth-magic-link', props: { name, url } },
  }
}

export function buildVerifyEmailNotification({ to, name, url }: { to: string, name: string, url: string }): EmailNotification {
  return {
    to,
    subject: 'Welcome! Please verify your email',
    body: `<p>Hi ${escapeHtml(name)},</p><p>Welcome! Click the link below to verify your email address and sign in.</p>`
      + `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
    text: `Hi ${name},\n\nVerify your email address and sign in: ${url}`,
    template: { name: 'auth-verify-email', props: { name, url } },
  }
}

/**
 * Builds and dispatches an auth email through @frigear-nu/notify. With @frigear-nu/email-templates
 * installed it is rendered from `notification.template` (overridable by the host's own
 * `app/emails/<name>.vue`). Hosts can also replace the subject/body in the `auth:email` hook;
 * delete `notification.template` there to keep a template from rendering over it.
 */
export async function dispatchAuthEmail(type: AuthEmailType, to: string, data: AuthEmailContext['data']) {
  const build = type === 'magic-link' ? buildMagicLinkNotification : buildVerifyEmailNotification
  const context: AuthEmailContext = { type, notification: build({ to, ...data }), data }
  await useNitroApp().hooks.callHook('auth:email', context)
  await dispatchEmailNotification(context.notification)
}
