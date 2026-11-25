/** One `.env` snippet; `label` names which kind of app it is for when a tab has more than one. */
export type CredentialsEnvBlock = {
  label?: 'server' | 'client'
  text: string
}

export type CredentialsEnvInput = {
  /** The issuer URL (`getOAuthIssuer`). A trailing `/` is dropped. */
  issuer: string
  clientId: string
  /** `null` for a public client: it has no secret. */
  clientSecret: string | null
  /** The redirect URI the app signs in with, when known. */
  redirectUri?: string | null
}

const lines = (entries: [string, string | null | undefined][]) =>
  entries.filter(([, value]) => !!value).map(([key, value]) => `${key}=${value}`).join('\n')

/**
 * The `.env` an app needs to sign in with this client: `frigear` for `@frigear-nu/auth` ("Log in with frigear.nu"; a
 * public client gets the server-rendered (PKCE) and the client mode blocks), `oidc` for nuxt-auth-utils' OIDC provider.
 */
export function credentialsEnv(input: CredentialsEnvInput): { frigear: CredentialsEnvBlock[], oidc: CredentialsEnvBlock[] } {
  const issuer = input.issuer.replace(/\/+$/, '')
  const sso = lines([
    ['NUXT_FRIGEAR_SSO_URL', issuer],
    ['NUXT_FRIGEAR_SSO_CLIENT_ID', input.clientId],
    ['NUXT_FRIGEAR_SSO_CLIENT_SECRET', input.clientSecret],
  ])
  const frigear: CredentialsEnvBlock[] = input.clientSecret
    ? [{ text: sso }]
    : [
        { label: 'server', text: sso },
        {
          label: 'client',
          text: lines([
            ['NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER', issuer],
            ['NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_ID', input.clientId],
            ['NUXT_PUBLIC_AUTHENTICATION_CLIENT_API_BASE', issuer],
          ]),
        },
      ]
  const oidc = lines([
    ['NUXT_OAUTH_OIDC_CLIENT_ID', input.clientId],
    ['NUXT_OAUTH_OIDC_CLIENT_SECRET', input.clientSecret],
    ['NUXT_OAUTH_OIDC_OPENID_CONFIG', `${issuer}/.well-known/openid-configuration`],
    ['NUXT_OAUTH_OIDC_REDIRECT_URL', input.redirectUri],
  ])
  return { frigear, oidc: [{ text: oidc }] }
}
