# @frigear-nu/oauth-resource

An OAuth 2.0 **resource server** for Nuxt services. A mobile app signs in once at an issuer (such as
[`@frigear-nu/oauth-server`](../oauth-server)) and calls every service with the same token; this module:

- verifies the RFC 9068 `at+jwt` access token against the issuer's JWKS (cached), checking `iss`, `aud` and `exp`;
- maps its `scope` to the [`@frigear-nu/auth`](../auth) principal, so routes use `requireAuth(event, { scopes })`;
- finds the user by `sub` (the issuer's id with `forceId`), creating unknown users from the issuer's userinfo;
- allows bearer-only CORS for the app's webview (`capacitor://localhost`, `https://localhost`).

The defaults (`issuer: https://frigear.nu`, `audience: frigear-services`) accept frigear.nu's tokens.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/oauth-resource'],
  oauthResource: { issuer: 'https://frigear.nu', audience: 'frigear-services' },
})
```

Renamed from `@frigear-nu/frigear-resource` (0.1.5): the config key is now `oauthResource` and the env vars
`NUXT_OAUTH_RESOURCE_*`.

Docs: https://docs.frigear.dev/modules/identity/oauth-resource
