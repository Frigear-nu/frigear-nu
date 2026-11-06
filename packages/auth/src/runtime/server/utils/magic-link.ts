import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import type { AuthStoredUser } from '../../types'

const MAGIC_LINK_TTL_MINUTES = 120

const VERIFICATION_CODE_PREFIX = 'v'

/**
 * What a link is for: `sign-in` (asked for on the login page) or `verify` (the account's own verification mail, sent at
 * sign-up or by staff). Kept in the code itself, as a prefix a plain code (hex) never starts with, so it needs no
 * column; only the server writes codes.
 */
export type MagicLinkPurpose = 'sign-in' | 'verify'

/** Whether a magic link code was issued as a verification link (`purpose: 'verify'`). */
export function isVerificationMagicLinkCode(code: string) {
  return code.startsWith(VERIFICATION_CODE_PREFIX)
}

/**
 * Issues a single-use sign-in link for the user. Returns `null` when a link was issued very recently
 * (see cooldown), in which case nothing should be sent.
 */
export async function createMagicLink(event: H3Event, { userId, redirectUrl, purpose = 'sign-in' }: { userId: number, redirectUrl?: string, purpose?: MagicLinkPurpose }) {
  // A link requested again within the cooldown is not re-sent, so the endpoint can't be used to flood an inbox.
  const cooldownSeconds = useRuntimeConfig(event).authentication?.magicLinkCooldown ?? 60
  const [latest] = await db.select({ createdAt: schema.magicLinks.createdAt })
    .from(schema.magicLinks)
    .where(eq(schema.magicLinks.userId, userId))
    .orderBy(desc(schema.magicLinks.createdAt))
    .limit(1)

  if (latest && Date.now() - latest.createdAt.getTime() < cooldownSeconds * 1000) {
    return null
  }

  const code = `${purpose === 'verify' ? VERIFICATION_CODE_PREFIX : ''}${createOneTimeCode()}`
  await db.insert(schema.magicLinks).values({
    userId,
    code,
    redirectUrl: isInternalPath(redirectUrl) ? redirectUrl : null,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000),
  })

  return { code, url: new URL(`/auth/magic-link?code=${code}`, getRequestURL(event).origin).toString() }
}

/** Atomically marks a valid link as used (so it can't be replayed) and returns it. */
export async function consumeMagicLink(code: string) {
  const [link] = await db.update(schema.magicLinks)
    .set({ usedAt: new Date() })
    .where(and(
      eq(schema.magicLinks.code, code),
      isNull(schema.magicLinks.usedAt),
      gt(schema.magicLinks.expiresAt, new Date()),
    ))
    .returning()
  return link
}

/** Emails a single-use sign-in link that also verifies the address. Resolves `false` when nothing was sent (cooldown). */
export async function sendVerificationLink(event: H3Event, user: Pick<AuthStoredUser, 'id' | 'name' | 'email'>) {
  const link = await createMagicLink(event, { userId: user.id, redirectUrl: getAfterLoginPath(event), purpose: 'verify' })
  if (!link) return false
  await dispatchAuthEmail('verify-email', user.email, { name: user.name, url: link.url })
  return true
}
