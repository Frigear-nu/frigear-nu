import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'

const MAGIC_LINK_TTL_MINUTES = 120

/**
 * Issues a single-use sign-in link for the user. Returns `null` when a link was issued very recently
 * (see cooldown), in which case nothing should be sent.
 */
export async function createMagicLink(event: H3Event, { userId, redirectUrl }: { userId: number, redirectUrl?: string }) {
  // A link requested again within the cooldown is not re-sent, so the endpoint can't be used to flood an inbox.
  const cooldownSeconds = useRuntimeConfig(event).users?.magicLinkCooldown ?? 60
  const [latest] = await db.select({ createdAt: schema.magicLinks.createdAt })
    .from(schema.magicLinks)
    .where(eq(schema.magicLinks.userId, userId))
    .orderBy(desc(schema.magicLinks.createdAt))
    .limit(1)

  if (latest && Date.now() - latest.createdAt.getTime() < cooldownSeconds * 1000) {
    return null
  }

  const code = createPasswordResetCode()
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
