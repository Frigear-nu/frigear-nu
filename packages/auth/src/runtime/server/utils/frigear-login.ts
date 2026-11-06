import type { H3Event } from 'h3'
import type { FrigearSsoConfig } from './frigear-sso'

/**
 * Completes a frigear.nu login: verifies the id token, syncs the local user and starts the session. `response` is the
 * token endpoint response; with `keepTokens` its tokens are kept (`storeOAuthTokens`).
 */
export async function handleFrigearLogin(event: H3Event, sso: FrigearSsoConfig, userinfo: Record<string, unknown>, response: object = {}) {
  const tokens = response as Record<string, unknown>
  // The verified id token decides who the user is (`sub`); userinfo fills in the profile.
  const idToken = typeof tokens.id_token === 'string' ? tokens.id_token : undefined
  const verified = idToken ? await verifyFrigearIdToken(sso, idToken) : undefined
  const claims: Record<string, unknown> = { ...verified, ...userinfo, ...(verified?.sub && { sub: verified.sub }) }

  const email = claims.email
  if (typeof email !== 'string' || !email) {
    throw createError({ statusCode: 400, statusMessage: 'No email returned from frigear.nu.' })
  }

  const picture = claims.picture
  // frigear.nu is the source of truth for roles: an admin there is an admin here.
  const role = sso.syncRole ? parseRoleClaim(claims) : undefined
  let user
  try {
    user = await syncFrigearUser({
      id: Number(claims.sub),
      email,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      picture: typeof picture === 'string' ? picture : undefined,
      emailVerified: claims.email_verified === true,
      role,
    }, { forceId: sso.forceId })
  }
  catch (error) {
    // An unverified address that belongs to an account here: back to the login page, which explains it.
    if ((error as { data?: { code?: string } }).data?.code !== 'frigear_email_unverified') throw error
    return authLoginErrorRedirect(event, 'oauth-unverified')
  }

  await setUserSession(event, {
    user: mapUserToSession(user),
    frigear: {
      id: String(claims.sub),
      colorMode: parseColorModeClaim(claims.color_mode),
      loggedInAt: Date.now(),
    },
  })
  // The tokens of this login replace any kept before (e.g. a step-up login replaces the plain one).
  if (sso.keepTokens) await storeOAuthTokens(user.id, 'frigear', parseOAuthTokenResponse(tokens, sso.scopes))

  return sendRedirect(event, consumeLoginRedirect(event))
}
