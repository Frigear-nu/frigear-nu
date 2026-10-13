import type { EmailNotification } from '@frigear-nu/notify/types'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const link = (url: string) => `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`

export function buildVerifyEmailChangeNotification({ to, name, url }: { to: string, name: string, url: string }): EmailNotification {
  return {
    to,
    subject: 'Confirm your new email address',
    body: `<p>Hi ${escapeHtml(name)},</p><p>Confirm that this is your new email address. The link expires in 24 hours.</p>${link(url)}`,
    text: `Hi ${name},\n\nConfirm your new email address (expires in 24 hours): ${url}`,
  }
}

export function buildEmailChangedNotification({ to, name, newEmail, revertUrl }: { to: string, name: string, newEmail: string, revertUrl: string }): EmailNotification {
  return {
    to,
    subject: 'Your email address was changed',
    body: `<p>Hi ${escapeHtml(name)},</p><p>The email address on your account was changed to <strong>${escapeHtml(newEmail)}</strong>.`
      + ` If this wasn't you, undo it within 7 days:</p>${link(revertUrl)}`,
    text: `Hi ${name},\n\nThe email address on your account was changed to ${newEmail}. If this wasn't you, undo it within 7 days: ${revertUrl}`,
  }
}

export function buildPasswordChangedNotification({ to, name }: { to: string, name: string }): EmailNotification {
  return {
    to,
    subject: 'Your password was changed',
    body: `<p>Hi ${escapeHtml(name)},</p><p>The password on your account was just changed. If this wasn't you, reset it right away.</p>`,
    text: `Hi ${name},\n\nThe password on your account was just changed. If this wasn't you, reset it right away.`,
  }
}
