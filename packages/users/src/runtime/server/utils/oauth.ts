import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

import type { H3Event } from 'h3'

type OAuthProfile = Record<string, unknown>

// GitHub: avatar_url, Google: picture (a url), Facebook: picture.data.url.
function avatarOf(profile: OAuthProfile): string | undefined {
  const picture = profile.picture
  if (typeof picture === 'object' && picture !== null) {
    return ((picture as { data?: { url?: string } }).data?.url) || undefined
  }
  return (profile.avatar_url ?? picture) as string | undefined
}

/**
 * Shared find-or-create logic used by the "simple" nuxt-auth-utils OAuth
 * routes registered through `settings.oauth` in the module config.
 */
export async function handleOAuthUser(event: H3Event, provider: string, profile: OAuthProfile) {
  const email = profile.email as string | undefined

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: `No email returned from the ${provider} OAuth provider.` })
  }

  let dbUser = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

  if (!dbUser) {
    const [created] = await db.insert(schema.users).values({
      name: (profile.name ?? profile.login ?? email) as string,
      email,
      avatar: avatarOf(profile),
    }).returning()
    dbUser = created
  }

  const [updated] = await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, dbUser!.id)).returning()
  dbUser = updated ?? dbUser

  await setUserSession(event, { user: mapUserToSession(dbUser) })

  return sendRedirect(event, '/')
}
