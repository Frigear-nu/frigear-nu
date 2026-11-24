import type { H3Event } from 'h3'
import type { AuthStoredUser } from '../../types'
import type { FrigearSsoConfig } from './frigear-sso'

/**
 * The `auth:frigear:login` hook: a frigear.nu login synced the local `user`, the session is not started yet. `claims`
 * are the verified id token's claims filled in by userinfo about the same user. A listener that changes the stored
 * user replaces `user` with the stored row, so the session starts with it.
 */
export type FrigearLoginContext = { user: AuthStoredUser, claims: Record<string, unknown> }

/** A frigear.nu login that went through: the local user and the extra session data to start the session with. */
export type FrigearLoginResult = { user: AuthStoredUser, session: Record<string, unknown> } | { error: 'oauth-unverified' }

/**
 * Completes a frigear.nu login: verifies the id token, syncs the local user and starts the session. `response` is the
 * token endpoint response; with `keepTokens` its tokens are kept (`storeOAuthTokens`).
 */
export async function handleFrigearLogin(event: H3Event, sso: FrigearSsoConfig, userinfo: Record<string, unknown>, response: object = {}) {
  const result = await resolveFrigearLogin(sso, userinfo, response)
  // An unverified address that belongs to an account here: back to the login page, which explains it.
  if ('error' in result) return authLoginErrorRedirect(event, result.error)
  await startAuthSession(event, result.user, result.session)
  return sendRedirect(event, consumeLoginRedirect(event))
}

/**
 * Everything of a frigear.nu login but the session: verifies the id token (and its `nonce`, when given), syncs the
 * local user and keeps the tokens (`keepTokens`). Answers the user and the session data to start the session with,
 * or `{ error: 'oauth-unverified' }`. The browser handoff (`frigear-handoff.ts`) starts the session later, in the window.
 */
export async function resolveFrigearLogin(sso: FrigearSsoConfig, userinfo: Record<string, unknown>, response: object = {}, options: { nonce?: string } = {}): Promise<FrigearLoginResult> {
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
  if (options.nonce !== undefined && verified.nonce !== options.nonce) {
    throw createError({ statusCode: 401, statusMessage: 'The frigear.nu identity token was not issued for this sign-in.' })
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
    return { error: 'oauth-unverified' }
  }

  // The tokens of this login replace any kept before (e.g. a step-up login replaces the plain one).
  if (sso.keepTokens) await storeOAuthTokens(user.id, 'frigear', parseOAuthTokenResponse(tokens, sso.scopes))

  // Other modules take what they own from the claims (`@frigear-nu/users`: the `locale` claim into `users.locale`).
  const context: FrigearLoginContext = { user, claims }
  await useNitroApp().hooks.callHook('auth:frigear:login', context)
  user = context.user

  return {
    user,
    session: {
      frigear: {
        id: String(claims.sub),
        colorMode: parseColorModeClaim(claims.color_mode),
        // One of the app's i18n locales; applied once per login (`frigear-locale.client`).
        locale: parseFrigearLocaleClaim(claims.locale, sso.i18n?.locales ?? []),
        loggedInAt: Date.now(),
      },
    },
  }
}
