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
 * routes registered through `authentication.settings.oauth` in the module config.
 */
export async function handleOAuthUser(event: H3Event, provider: string, profile: OAuthProfile) {
  const email = profile.email as string | undefined

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: `No email returned from the ${provider} OAuth provider.` })
  }

  const users = useAuthUserStore()

  const existing = await users.findByEmail(email)
  const user = existing ?? await users.create({
    name: (profile.name ?? profile.login ?? email) as string,
    email,
    avatar: avatarOf(profile),
  })
  const updated = await users.update(user.id, { lastLoginAt: new Date() })

  await setUserSession(event, { user: mapUserToSession(updated ?? user) })

  return sendRedirect(event, consumeLoginRedirect(event))
}
