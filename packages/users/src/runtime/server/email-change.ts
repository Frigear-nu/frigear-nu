import { db } from '@nuxthub/db'

// Helpers of the email change routes (`verifyEmailChange`). Kept out of `server/utils` so they are not auto-imported
// into the host app.

export const EMAIL_CHANGE_INVALID = 'This confirmation link is invalid or has expired.'
export const EMAIL_REVERT_INVALID = 'This link is invalid or has expired.'

/** `ada@example.com` → `a***@example.com`: enough for the owner to recognise it, not to learn someone else's address. */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export const findEmailChangeByCode = (code: string) =>
  db.query.accountEmailChanges.findFirst({ where: (t, { eq }) => eq(t.code, code) })

export const findEmailChangeByRevertCode = (revertCode: string) =>
  db.query.accountEmailChanges.findFirst({ where: (t, { eq }) => eq(t.revertCode, revertCode) })
