// The OAuth sign-in buttons of this deployment. Resolved per request, because the credentials are usually runtime
// secrets that the build never sees.
export default eventHandler(event => listOAuthProviders(event))
