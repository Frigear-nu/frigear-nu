import type { H3Event } from 'h3'

/** `confidential` applications authenticate with a client secret; `public` ones (native apps, SPAs) rely on PKCE alone. */
export type ClientType = 'confidential' | 'public'

/** How a scope is presented on the consent screen. Everything but `name` is optional. */
export type OAuthScopeDefinition = {
  name: string
  /** Short, human-readable label, e.g. "View your bills". */
  label?: string
  /** One line explaining what the application can do with it. */
  description?: string
  /** Iconify name, e.g. `i-lucide-receipt`. */
  icon?: string
}

export type ModuleOptions = {
  /**
   * The `iss` claim and the discovery issuer, e.g. `https://id.example.com`. Defaults to the origin of the
   * incoming request, which is fine in development but should be set explicitly behind proxies.
   */
  issuer?: string
  /** `kid` of the signing key (published in the JWKS). Defaults to `key-1`; change it when rotating keys. */
  keyId?: string
  /** Access and ID token lifetime in seconds. Defaults to `3600`. */
  accessTokenTtl?: number
  /** Refresh token lifetime in seconds. Defaults to 30 days. */
  refreshTokenTtl?: number
  /** Authorization code lifetime in seconds. Defaults to `600`. */
  codeTtl?: number
  /** Path appended to an application's `websiteUrl` to form its redirect URI. Defaults to `/auth/frigear`. */
  callbackPath?: string
  /**
   * Extra scopes advertised and accepted next to `openid profile email`. Enrich their claims with `oauth:claims`.
   * Give a scope a `label`, `description` and `icon` to show it nicely on the consent screen (a plain string shows
   * the description it was registered with through `addAuthScope`, or its name).
   */
  scopes?: Array<string | OAuthScopeDefinition>
  /**
   * Browser apps on another origin (for example the webview of a Capacitor app at `capacitor://localhost`) may call the
   * token, revocation, userinfo and discovery endpoints. Exact origins only, never `*`. The authorization endpoint is
   * never opened up: it is a top-level navigation. Cookies are not allowed cross-origin either.
   */
  cors?: {
    origins?: string[]
  }
  settings?: {
    // Expose this module's MCP tools, resources and prompts on the MCP endpoint. Defaults to `false`.
    mcp?: boolean
    pages?: {
      /** Consent screen. On by default (`/authorize`); pass `false` to provide your own page at that path. */
      authorize?: string | boolean
      /** Admin UI for applications. `true` = `/admin/oauth`. Needs `@nuxt/ui`. */
      admin?: string | boolean
      /** The signed-in user's applications. `true` = `/account/applications`. Needs `@nuxt/ui`. */
      applications?: string | boolean
    }
    /** Where unauthenticated users are sent to sign in. Defaults to the `@frigear-nu/users` login page. */
    signInPath?: string
  }
}

/** Private runtime config (`runtimeConfig.oauthServer`). Keys are PEM strings, set them through env. */
export type OAuthServerRuntimeConfig = {
  /** PKCS8 RSA private key (`NUXT_OAUTH_SERVER_PRIVATE_KEY`). Single-line PEM with literal `\n` works. */
  privateKey: string
  /** SPKI RSA public key (`NUXT_OAUTH_SERVER_PUBLIC_KEY`). Derived from the private key when empty. */
  publicKey: string
  /**
   * Public keys of earlier signing keys, kept during a rotation: `{ "<kid>": "<SPKI PEM>" }` (an object, or
   * the same as a JSON string for `NUXT_OAUTH_SERVER_PREVIOUS_PUBLIC_KEYS`). They are published in the JWKS and
   * still verify tokens, but nothing is signed with them.
   */
  previousPublicKeys: string | Record<string, string>
  issuer?: string
  keyId: string
  accessTokenTtl: number
  refreshTokenTtl: number
  codeTtl: number
  callbackPath: string
  scopes: string[]
  /** Consent screen details of the configured scopes that have any. */
  scopeDetails: OAuthScopeDefinition[]
  /** Allowed CORS origins (`NUXT_OAUTH_SERVER_CORS_ORIGINS` takes a comma separated list). */
  corsOrigins: string[] | string
  authorizePath: string
  signInPath?: string
}

export type PublicModuleOptions = {
  pages: { authorize?: string, admin?: string, applications?: string }
}

/** The user as read from the `users` table (including columns the host added through `extend.sqlite.ts`). */
export type OAuthUser = {
  id: number
  name: string
  email: string
  avatar: string | null
} & Record<string, unknown>

/** An application without its secret hash. */
export type OAuthApplication = {
  /** `app_` + random id; it is the OAuth `client_id`. */
  id: string
  /** `public` applications have no client secret; they must use PKCE and may register native redirect URIs. */
  clientType: ClientType
  name: string
  description: string | null
  icon: string | null
  priority: number
  websiteUrl: string
  loginUrl: string | null
  previewUrlPattern: string | null
  /** Extra exact redirect URIs next to the derived `websiteUrl + callbackPath`. Public clients may list native (custom scheme) URIs. */
  redirectUris: string[]
  /** Roles allowed to sign in. Empty = every signed-in user. */
  allowedRoles: string[]
  tags: string[]
  ownerId: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** What the signed-in user needs to see to launch an application. */
export type UserApplicationDto = Pick<OAuthApplication, 'id' | 'name' | 'description' | 'icon' | 'priority' | 'websiteUrl' | 'tags'> & {
  loginUrl: string
}

export type ApplicationInput = {
  /** Fixed at creation. Defaults to `confidential`. */
  clientType?: ClientType
  name: string
  websiteUrl: string
  description?: string | null
  icon?: string | null
  priority?: number
  loginUrl?: string | null
  previewUrlPattern?: string | null
  redirectUris?: string[]
  allowedRoles?: string[]
  tags?: string[]
  isActive?: boolean
}

export type TokenType = 'id_token' | 'access_token' | 'userinfo'

export type AuthorizeContext = {
  event: H3Event
  userId: number
  allowed: boolean
}

export type UserRolesContext = {
  event?: H3Event
  userId: number
  /** Push the user's roles here. Several listeners add up. */
  roles: string[]
}

export type ApplicationAccessContext = {
  event?: H3Event
  user: OAuthUser
  application: OAuthApplication
  /** The roles resolved through `oauth:user:roles`. */
  roles: string[]
  /** `true` when the role check passed; set `false` (and optionally `reason`) to veto. */
  allowed: boolean
  reason?: string
}

export type ClaimsContext = {
  user: OAuthUser
  application: OAuthApplication
  /** The granted scopes. */
  scope: string[]
  roles: string[]
  tokenType: TokenType
  /** Mutate this to add, change or remove claims. Standard claims (`sub`, `iss`, `aud`, `exp`, `iat`) are set afterwards. */
  claims: Record<string, unknown>
}

export type TokenIssuedContext = {
  userId: number
  applicationId: string
  scope: string[]
  grant: 'authorization_code' | 'refresh_token'
}

export type TokenRevokedContext = {
  applicationId: string
  userId: number | null
  reason: 'revoked' | 'reuse_detected' | 'user_grants_revoked'
}

/** What the admin API returns (dates are ISO strings over the wire). */
export type AdminApplicationDto = Omit<OAuthApplication, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
  /** Refresh tokens that are still valid, i.e. users currently signed in. */
  activeGrants?: number
  /** The redirect URI the application has to accept. */
  callbackUrl: string
}

/** One page of `GET /api/admin/oauth-server/applications` (the shape `useTableQuery` speaks). */
export type AdminApplicationsPage = {
  items: AdminApplicationDto[]
  total: number
  page: number
  pageSize: number
}

/** Returned once when an application is created. */
export type CreatedApplicationDto = AdminApplicationDto & {
  clientId: string
  /** `null` for public clients: they have no secret. */
  clientSecret: string | null
}

export type ConsentDto = {
  application: Pick<OAuthApplication, 'id' | 'name' | 'description' | 'icon' | 'websiteUrl'>
  scope: string[]
  /** The requested scopes with whatever the server knows to present them (configured details, registered descriptions). */
  scopes?: OAuthScopeDefinition[]
  user: { name: string, email: string, avatar: string | null }
}
