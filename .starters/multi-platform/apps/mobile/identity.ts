// Who this app is: the one place to rename it. `nuxt.config.ts` reads it, and so does the OAuth server that signs the
// app in (`apps/web` of the standalone starter imports `@workspace/mobile/identity`). Plain values only: Node loads
// this file together with the config, so it must not import from Nuxt or the app.

/**
 * Reverse-DNS app id: the iOS bundle id and the Android application id. Lowercased (with `_` as `-`) it is also the
 * URL scheme of the OAuth redirect, so stick to lowercase letters, digits, `.` and `-`. After changing it, delete
 * `ios/` and `android/` and run `pnpm mobile:native` again.
 */
export const appId = 'com.example.mobile'

/** The name under the home screen icon and the fallback page title. */
export const appName = 'Example'

/** The OAuth `client_id`. The issuer must have a public client with this id and the redirect URIs below. */
export const clientId = 'mobile'

/** Path of the sign-in callback page, in the app and in both redirect URIs. */
export const callbackPath = '/auth/callback'

/** Port of `pnpm dev` for this app (a desktop browser). The dev redirect URI uses it; keep the `dev` script in step. */
export const devPort = 3001

/**
 * Requested scopes. The Frigear OAuth server always issues a refresh token; other issuers (Keycloak, Auth0, ...) may
 * need `offline_access` here for one, or the app is signed out when the access token expires.
 */
export const scopes = ['openid', 'profile', 'email']

/** The redirect URI of the iOS and Android app, `<scheme>:<callbackPath>`. Register it at the issuer. */
export const nativeRedirectUri = `${appId.toLowerCase().replaceAll('_', '-')}:${callbackPath}`

/** The redirect URI of `pnpm dev` in a desktop browser. Register it at the issuer for development only. */
export const devRedirectUri = `http://localhost:${devPort}${callbackPath}`
