import type { H3Event } from 'h3'
import type { FrigearSsoConfig } from './frigear-sso'

/**
 * Completes a frigear.nu login: verifies the id token, syncs the local user and starts the session. `response` is the
 * token endpoint response; with `keepTokens` its tokens are kept (`storeOAuthTokens`).
 */
export async function handleFrigearLogin(event: H3Event, sso: FrigearSsoConfig, userinfo: Record<string, unknown>, response: object = {}) {
  const tokens = response as Record<string, unknown>
  // The verified id token decides who the user is (`sub`); userinfo only fills in the profile, and only when it is
  // about the same user. Without an id token nothing binds the login to this client, so it is refused.
  const idToken = typeof tokens.id_token === 'string' ? tokens.id_token : undefined
  if (!idToken) {
    throw createError({ statusCode: 401, statusMessage: 'frigear.nu returned no identity token.' })
  }
  const verified = await verifyFrigearIdToken(sso, idToken)
  if (typeof verified.sub !== 'string' || !verified.sub) {
    throw createError({ statusCode: 401, statusMessage: 'The frigear.nu identity token names no user.' })
  }
  if (Object.keys(userinfo).length && String(userinfo.sub) !== verified.sub) {
    throw createError({ statusCode: 401, statusMessage: 'The frigear.nu profile is not about the signed-in user.' })
  }
  const claims: Record<string, unknown> = { ...verified, ...userinfo, sub: verified.sub }

  const email = claims.email
  if (typeof email !== 'string' || !email) {
    throw createError({ statusCode: 400, statusMessage: 'No email returned from frigear.nu.' })
  }

  const picture = claims.picture
  // With a role map, frigear.nu decides the single sign-on roles: only from the signed id token (never userinfo), only
  // roles the map lists. They replace the user's `sso` role rows; manually assigned roles stay.
  const roles = sso.syncRole ? mapRoleClaims(verified, sso.roleMap, sso.defaultRole) : undefined
  let user
  try {
    user = await syncFrigearUser({
      id: Number(claims.sub),
      email,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      picture: typeof picture === 'string' ? picture : undefined,
      emailVerified: claims.email_verified === true,
      roles,
    }, { forceId: sso.forceId })
  }
  catch (error) {
    // An unverified address that belongs to an account here: back to the login page, which explains it.
    if ((error as { data?: { code?: string } }).data?.code !== 'frigear_email_unverified') throw error
    return authLoginErrorRedirect(event, 'oauth-unverified')
  }

  await startAuthSession(event, user, {
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
