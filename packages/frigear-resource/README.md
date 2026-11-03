# @frigear-nu/frigear-resource

Accept frigear.nu access tokens in any Frigear service. One mobile app signs in once at frigear.nu
([`@frigear-nu/oauth-server`](../oauth-server)) and calls every service with the same token; this module:

- verifies the `at+jwt` access token against frigear.nu's JWKS (cached), checking `iss`, `aud` and `exp`;
- maps its `scope` to the [`@frigear-nu/auth`](../auth) principal, so routes use `requireAuth(event, { scopes })`;
- finds the user by `sub` (the frigear.nu id with `forceId`), creating unknown users from frigear.nu's userinfo;
- allows bearer-only CORS for the app's webview (`capacitor://localhost`, `https://localhost`).

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/frigear-resource'],
  frigearResource: { issuer: 'https://frigear.nu', audience: 'frigear-services' },
})
```

Docs: https://docs.frigear.dev/modules/identity/frigear-resource
