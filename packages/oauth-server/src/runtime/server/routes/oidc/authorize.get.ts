import { getQuery, getRequestURL, sendRedirect } from 'h3'
import { invalidScopeRedirect, parseAuthorizeRequest } from '../../utils/oauth-authorize'

// Entry point of the authorization code flow (with PKCE). It validates the request, sends people who
// are not signed in to the login page (which returns here), checks that the user may use the
// application, and then hands over to the consent page. Unknown scopes are answered with an `invalid_scope` redirect. No state is kept on the server: the consent
// page and the approval re-validate the same parameters.
export default defineEventHandler(async (event) => {
  // Not `getValidatedQuery`: it would replace the message naming the bad parameters with h3's generic one.
  const query = parseAuthorizeRequest(getQuery(event))
  const { application, unknown } = await validateAuthorizeRequest(event, query)
  // The client and its redirect URI are trusted now: an unknown scope goes back to it (RFC 6749 §4.1.2.1).
  if (unknown.length) return sendRedirect(event, invalidScopeRedirect(query, unknown), 302)

  const url = getRequestURL(event)
  const session = await getUserSession(event)
  if (!session.user) {
    return sendRedirect(event, `${getSignInPath()}?redirect=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302)
  }

  const user = await requireOAuthUser(await requireSessionUserId(event))
  await assertApplicationAccess(event, user, application)

  return sendRedirect(event, `${useOAuthConfig().authorizePath}${url.search}`, 302)
})
