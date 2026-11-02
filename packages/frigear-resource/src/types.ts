export type ModuleOptions = {
  /** The token issuer (`iss`), i.e. the frigear.nu OAuth server. Defaults to `https://frigear.nu`. */
  issuer?: string
  /** The `aud` access tokens must carry: the shared audience of the Frigear services. Defaults to `frigear-services`. */
  audience?: string | string[]
  /** Where the issuer publishes its signing keys. Defaults to `<issuer>/.well-known/jwks.json`. */
  jwksUrl?: string
  /** Where unknown users' profiles are read with their token. Defaults to `<issuer>/oauth/userinfo`. */
  userinfoUrl?: string
  /**
   * Browser origins that may call this service with a bearer token, e.g. the webview of the mobile app. Exact origins
   * only, never `*`; cookies are never allowed cross-origin. Defaults to `capacitor://localhost` and `https://localhost`.
   */
  corsOrigins?: string[]
  /** Path prefixes the CORS headers apply to. Defaults to `/api/`. */
  corsPaths?: string[]
  /**
   * Use the frigear.nu user id (`sub`) as the local `users.id`. Defaults to `runtimeConfig.frigear.forceId` (the
   * setting of "Log in with frigear.nu"), so tokens and logins find the same users. Without it users are matched by email.
   */
  forceId?: boolean
  /** How long the issuer's keys are cached, in seconds. Defaults to `600`. Unknown key ids refetch earlier. */
  jwksCacheTtl?: number
}

/** `runtimeConfig.frigearResource`: every key can be set through `NUXT_FRIGEAR_RESOURCE_*`. */
export type FrigearResourceRuntimeConfig = {
  issuer: string
  /** Comma separated through env. */
  audience: string[] | string
  jwksUrl: string
  userinfoUrl: string
  /** Comma separated through env. */
  corsOrigins: string[] | string
  corsPaths: string[] | string
  /** `''` = follow `runtimeConfig.frigear.forceId`. */
  forceId: boolean | ''
  jwksCacheTtl: number
}

/** The claims of a verified frigear.nu access token (RFC 9068). */
export type FrigearAccessToken = {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat?: number
  jti?: string
  client_id: string
  scope?: string
} & Record<string, unknown>

/** What the issuer's userinfo endpoint tells about an unknown user. */
export type FrigearUserinfo = {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}
