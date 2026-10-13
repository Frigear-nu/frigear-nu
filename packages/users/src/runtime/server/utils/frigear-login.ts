import type { H3Event } from 'h3'
import type { FrigearSsoConfig } from './frigear-sso'

/** Completes a frigear.nu login: verifies the id token, syncs the local user and starts the session. */
export async function handleFrigearLogin(event: H3Event, sso: FrigearSsoConfig, userinfo: Record<string, unknown>, idToken?: string) {
  // The verified id token decides who the user is (`sub`); userinfo fills in the profile.
  const verified = idToken ? await verifyFrigearIdToken(sso, idToken) : undefined
  const claims: Record<string, unknown> = { ...verified, ...userinfo, ...(verified?.sub && { sub: verified.sub }) }

  const email = claims.email
  if (typeof email !== 'string' || !email) {
    throw createError({ statusCode: 400, statusMessage: 'No email returned from frigear.nu.' })
  }

  const picture = claims.picture
  const user = await syncFrigearUser({
    id: Number(claims.sub),
    email,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    picture: typeof picture === 'string' ? picture : undefined,
    emailVerified: claims.email_verified === true,
  }, { forceId: sso.forceId })

  await setUserSession(event, {
    user: mapUserToSession(user),
    frigear: {
      id: String(claims.sub),
      colorMode: parseColorModeClaim(claims.color_mode),
      loggedInAt: Date.now(),
    },
  })

  return sendRedirect(event, '/')
}
