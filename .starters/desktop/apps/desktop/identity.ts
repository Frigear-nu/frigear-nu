// Who this app is: the one place to rename it. `nuxt.config.ts` reads it, and so can the OAuth server that signs the app
// in (import `@workspace/desktop/identity` from a server in this workspace). Plain values only: Node loads this file
// together with the config, so it must not import from Nuxt or the app.

/**
 * Reverse-DNS app id: the Tauri `identifier`. Lowercased (with `_` as `-`) it is also the deep-link scheme of the OAuth
 * redirect, so stick to lowercase letters, digits, `.` and `-`, and avoid a last segment of `app` (it clashes with the
 * macOS bundle extension). After changing it, run `pnpm desktop:sync`.
 */
export const appId = 'com.example.desk'

/** The product name: the window title, the installer and the app bundle. */
export const appName = 'Example'

/** The OAuth `client_id` (remote mode). The issuer must have a public client with this id and the redirect URIs below. */
export const clientId = 'desktop'

/** Path of the sign-in callback page, in the app and in both redirect URIs. */
export const callbackPath = '/auth/callback'

/**
 * Port of `pnpm dev` and of the window under `pnpm desktop:dev` (`devServer.port`). Not 3000, so an issuer can run on
 * this machine next to it. The dev redirect URI uses it.
 */
export const devPort = 3001

/**
 * Requested scopes. The Frigear OAuth server always issues a refresh token; other issuers (Keycloak, Auth0, ...) may
 * need `offline_access` here for one, or the app is signed out when the access token expires.
 */
export const scopes = ['openid', 'profile', 'email']

/** The redirect URI of a built app, `<scheme>:<callbackPath>`, received as a deep link. Register it at the issuer. */
export const nativeRedirectUri = `${appId.toLowerCase().replaceAll('_', '-')}:${callbackPath}`

/** The redirect URI under `pnpm desktop:dev` and `pnpm dev`. Register it at the issuer for development only. */
export const devRedirectUri = `http://localhost:${devPort}${callbackPath}`

/** The origins of the Tauri webview (macOS and Linux, then Windows). Allow them for CORS at the issuer and your API. */
export const webviewOrigins = ['tauri://localhost', 'http://tauri.localhost']
