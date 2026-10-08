import { getQuery, getRequestURL, sendRedirect } from 'h3'

// Entry point of the authorization code flow (with PKCE). It validates the request, sends people who
// are not signed in to the login page (which returns here), checks that the user may use the
// application, and then hands over to the consent page. No state is kept on the server: the consent
// page and the approval re-validate the same parameters.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { application } = await validateAuthorizeRequest(query)

  const session = await getUserSession(event)
  if (!session.user) {
    const url = getRequestURL(event)
    return sendRedirect(event, `${getSignInPath()}?redirect=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302)
  }

  const user = await getOAuthUser(Number((session.user as { id: number | string }).id))
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unknown user.' })
  await assertApplicationAccess(event, user, application)

  const url = getRequestURL(event)
  return sendRedirect(event, `${useOAuthConfig().authorizePath}${url.search}`, 302)
})
