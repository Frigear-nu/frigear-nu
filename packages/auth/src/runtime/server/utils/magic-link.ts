import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import type { AuthStoredUser } from '../../types'

/** How long a link people ask for themselves (sign-in, sign-up verification) stays valid: 2 hours. */
const MAGIC_LINK_TTL_SECONDS = 120 * 60

/** How long an invite link (staff created the account) stays valid: `authentication.settings.inviteTtl`, 7 days by default. */
function inviteLinkTtlSeconds(event?: H3Event): number {
  const configured = Number(useRuntimeConfig(event).authentication?.inviteTtl)
  return Number.isFinite(configured) && configured > 0 ? configured : 7 * 24 * 60 * 60
}

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
 * (see cooldown), in which case nothing should be sent. `ttlSeconds` is how long it stays valid (default 2 hours,
 * `MAGIC_LINK_TTL_SECONDS`); an invite passes `inviteLinkTtlSeconds(event)`.
 */
export async function createMagicLink(event: H3Event, { userId, redirectUrl, purpose = 'sign-in', ttlSeconds = MAGIC_LINK_TTL_SECONDS }: { userId: number, redirectUrl?: string, purpose?: MagicLinkPurpose, ttlSeconds?: number }) {
  // Resolved first: without a site URL nothing is stored (and no cooldown starts).
  const origin = authSiteOrigin(event)
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
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  })

  return { code, url: new URL(`/auth/magic-link?code=${code}`, origin).toString() }
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

/**
 * Emails a single-use sign-in link that also verifies the address. Resolves `false` when nothing was sent (cooldown).
 * With `invite: true` (staff created the account) the link stays valid for `authentication.settings.inviteTtl`
 * (7 days by default) instead of 2 hours.
 */
export async function sendVerificationLink(event: H3Event, user: Pick<AuthStoredUser, 'id' | 'name' | 'email'>, options: { invite?: boolean } = {}) {
  const ttlSeconds = options.invite ? inviteLinkTtlSeconds(event) : MAGIC_LINK_TTL_SECONDS
  const link = await createMagicLink(event, { userId: user.id, redirectUrl: getAfterLoginPath(event), purpose: 'verify', ttlSeconds })
  if (!link) return false
  await dispatchAuthEmail('verify-email', user.email, { name: user.name, url: link.url })
  return true
}
