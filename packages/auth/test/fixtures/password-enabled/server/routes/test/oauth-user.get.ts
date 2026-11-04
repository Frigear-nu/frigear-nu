// Runs the OAuth find-or-create step with a profile from the query, as a provider callback would.
export default eventHandler((event) => {
  const { email, verified } = getQuery(event)
  return handleOAuthUser(event, 'auth0', { email, email_verified: verified !== 'false' }, { signUp: false })
})
