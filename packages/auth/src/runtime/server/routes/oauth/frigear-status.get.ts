// Whether "Log in with frigear.nu" is active for this deployment. Resolved per request (like `/auth/frigear`),
// because the SSO credentials are usually runtime secrets that the build, which bakes `public.authentication.frigearSso`,
// never sees.
export default eventHandler(event => ({ enabled: resolveFrigearSso(event).enabled }))
