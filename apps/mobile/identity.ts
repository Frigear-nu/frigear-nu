// Who this app is: the one place to rename it. `nuxt.config.ts` reads it, and so does the OAuth server that signs the
// app in (`apps/web` of the standalone starter imports `@workspace/mobile/identity`). Plain values only: Node loads
// this file together with the config, so it must not import from Nuxt or the app.

/**
 * Reverse-DNS app id: the iOS bundle id and the Android application id. Lowercased (with `_` as `-`) it is also the
 * URL scheme of the OAuth redirect, so stick to lowercase letters, digits, `.` and `-`. After changing it, delete
 * `ios/` and `android/` and run `pnpm mobile:native` again.
 */
export const appId = 'nu.frigear.app'

/** The name under the home screen icon and the fallback page title. */
export const appName = 'Frigear'

/** The OAuth `client_id`. The issuer must have a public client with this id and the redirect URIs below. */
export const clientId = 'mobile'

/** Path of the sign-in callback page, in the app and in both redirect URIs. */
export const callbackPath = '/auth/callback'

/** Port of `pnpm dev` for this app (a desktop browser). The dev redirect URI uses it; keep the `dev` script in step. */
export const devPort = 3001

/**
 * Requested scopes. An access token carries only the permissions its scopes stand for, and the website's API checks
 * them on every `/api/` call the modules make: so the app asks for what its tabs use (the user grants what they hold).
 * Named scopes: `crew`, `shifts`, `perks`, `help-center`, `teams`, `operations`, `tickets`, `notifications`; the rest
 * are permissions of the modules' self-service (profile, dashboard layouts, shift swaps, "Your apps", forms). The Wallet
 * tab shows the user's Frigear ID (`frigear-id:read`) and its scanner checks Frigear IDs (`frigear-id:verify`, crew),
 * tickets (`events:manage`, event managers) and shift passes (`shifts:checkin`, bar managers): a staff scope the user
 * does not hold is left out of the token, so asking for it is harmless.
 */
export const scopes = [
  'openid', 'profile', 'email',
  'crew', 'crew:apply', 'shifts', 'shifts:swap', 'shifts:attend', 'shifts:lead', 'perks', 'help-center', 'teams',
  'operations', 'tickets', 'notifications', 'dashboard:layouts', 'profile:read', 'profile:write', 'oauth:read', 'forms',
  'frigear-id:read', 'frigear-id:verify', 'events:manage', 'shifts:checkin',
]

/** The redirect URI of the iOS and Android app, `<scheme>:<callbackPath>`. Register it at the issuer. */
export const nativeRedirectUri = `${appId.toLowerCase().replaceAll('_', '-')}:${callbackPath}`

/** The redirect URI of `pnpm dev` in a desktop browser. Register it at the issuer for development only. */
export const devRedirectUri = `http://localhost:${devPort}${callbackPath}`
