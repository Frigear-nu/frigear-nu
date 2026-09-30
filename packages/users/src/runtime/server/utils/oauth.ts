import { db, schema } from '@nuxthub/db'

import type { H3Event } from 'h3'

type OAuthProfile = Record<string, unknown>

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
      avatar: (profile.avatar_url ?? profile.picture) as string | undefined,
    }).returning()
    dbUser = created
  }

  await setUserSession(event, { user: { id: dbUser.id } })

  return sendRedirect(event, '/')
}
