import type { H3Event } from 'h3'

/** `confidential` applications authenticate with a client secret; `public` ones (native apps, SPAs) rely on PKCE alone. */
export type ClientType = 'confidential' | 'public'

/**
 * What kind of client an application is, for the session-length guardrails: `confidential` (a server holds the tokens),
 * `browser` (public, with a web redirect URI: tokens live in the browser) or `native` (public, only custom-scheme or
 * loopback redirect URIs: tokens live in the device keychain).
 */
export type OAuthClientKind = 'confidential' | 'browser' | 'native'

/** How long refresh tokens live, in seconds. */
export type RefreshTokenPolicy = {
  /** How long a refresh token lives unused. Every refresh starts a new window. */
  idleTtl: number
  /** How long a sign-in lives in total, counted from when the user signed in. `null` = no cap. */
  maxAge: number | null
}

/**
 * A scope of `oauthServer.scopes`, also how a scope is presented on the consent screen. Everything but `name` is
 * optional.
 *
 * - A single word (`groups`, `tickets`) is a **named scope**: registered with `addScope` of `@frigear-nu/auth`, it
 *   stands for its `permissions` (none, like `openid`, is fine). Never sensitive or `sessionOnly` permissions.
 * - A permission (`vouchers:read`) or wildcard only describes that permission scope on the consent screen; the
 *   permission itself is registered with `addPermission` (or `authentication.permissions`).
 */
export type OAuthScopeDefinition = {
  name: string
  /** Short, human-readable label, e.g. "View your bills". */
  label?: string
  /** i18n key of the label. */
  labelKey?: string
  /** One line explaining what the application can do with it. */
  description?: string
  /** Iconify name, e.g. `i-lucide-receipt`. */
  icon?: string
  /**
   * The service the scope belongs to, e.g. `Vouchers` for `vouchers:read`. The consent screen groups scopes by it;
   * scopes without one belong to this server (the account itself).
   */
  service?: string
  /** Named scopes only: the permissions (or wildcards) it stands for. */
  permissions?: string[]
}

/** A named scope stored in the database (`oauth_scopes`), managed by staff. */
export type OAuthDbScope = {
  name: string
  label: string | null
  description: string | null
  icon: string | null
  /** Permissions or wildcards; never sensitive or `sessionOnly` ones. */
  permissions: string[]
  /** Bumped whenever the permissions it expands to grow: users are asked to consent again. */
  version: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** A scope in the admin API: a database scope, or a read-only one from config or a module (`managed`). */
export type AdminOAuthScopeDto = {
  name: string
  label: string | null
  description: string | null
  icon: string | null
  service: string | null
  permissions: string[]
  version: number
  isActive: boolean
  /** Defined in `oauthServer.scopes` or by a module (`addScope`): read-only here (409 `managed_by_config`). */
  managed: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** The body of `POST` / `PATCH /api/admin/oauth-server/scopes`. */
export type OAuthScopeInput = {
  name: string
  label?: string | null
  description?: string | null
  icon?: string | null
  permissions: string[]
  isActive?: boolean
}

/** RFC 7662 introspection answer of `POST /oauth/introspect`. Inactive tokens answer `{ active: false }` only. */
export type OAuthIntrospectionDto = {
  active: boolean
  scope?: string
  client_id?: string
  sub?: string
  exp?: number
  iat?: number
  iss?: string
  aud?: string | string[]
  token_type?: 'Bearer'
  /** The token's permissions now: its frozen set, within what its user may still do. */
  permissions?: string[]
}

export type ModuleOptions = {
  /**
   * The `iss` claim and the discovery issuer, e.g. `https://id.example.com`. Defaults to the origin of the
   * incoming request (`x-forwarded-*` headers are ignored), which is fine in development; set it in production
   * (a warning is logged once when it is not), also as `NUXT_OAUTH_SERVER_ISSUER`.
   */
  issuer?: string
  /** `kid` of the signing key (published in the JWKS). Defaults to `key-1`; change it when rotating keys. */
  keyId?: string
  /**
   * Access and ID token lifetime in seconds. Defaults to `900` (15 minutes). Keep it short (5 to 15 minutes) when
   * access tokens are accepted by other services (`accessTokenAudience`): they cannot be revoked, only refreshed.
   */
  accessTokenTtl?: number
  /**
   * The `aud` of every access token, e.g. `frigear-services`: the services that accept tokens of this server (resource
   * servers such as `@frigear-nu/oauth-resource`) check it. Defaults to the application's `client_id`.
   * `NUXT_OAUTH_SERVER_ACCESS_TOKEN_AUDIENCE` takes a comma separated list.
   */
  accessTokenAudience?: string | string[]
  /**
   * The default refresh-token policy, in seconds: `idleTtl` (unused lifetime, renewed on every refresh, default 30 days)
   * and `maxAge` (the whole sign-in, counted from when the user signed in; default `null`, no cap). Both at most two
   * years. An application's own session length (admin UI) or a configured client's `refreshToken` overrides it.
   */
  refreshToken?: Partial<RefreshTokenPolicy>
  /** @deprecated Use `refreshToken.idleTtl`. Refresh token lifetime in seconds. Defaults to 30 days. */
  refreshTokenTtl?: number
  /**
   * End every OAuth sign-in of a user when their password is changed or reset, or their email changes (the
   * `auth:credentials:changed` hook of `@frigear-nu/auth`). Defaults to `true`.
   */
  revokeOnCredentialChange?: boolean
  /** Authorization code lifetime in seconds. Defaults to `600`. */
  codeTtl?: number
  /** Path appended to an application's `websiteUrl` to form its redirect URI. Defaults to `/auth/frigear`. */
  callbackPath?: string
  /**
   * Scopes next to the OIDC ones and every permission a token may hold. A single word is a named scope (registered
   * with `addScope` of `@frigear-nu/auth`, standing for its `permissions`); a permission name (`vouchers:read`) only
   * gives that permission scope its `label`, `description`, `icon` and `service` on the consent screen. Modules
   * register named scopes with `addScope`; staff add more in the admin UI (stored in `oauth_scopes`). Enrich claims
   * with `oauth:claims`.
   */
  scopes?: Array<string | OAuthScopeDefinition>
  /**
   * Browser apps on another origin (for example the webview of a Capacitor app at `capacitor://localhost`) may call the
   * token, revocation, userinfo and discovery endpoints. Exact origins only, never `*`. The authorization endpoint is
   * never opened up: it is a top-level navigation. Cookies are not allowed cross-origin either.
   */
  cors?: {
    /** Exact origins (`NUXT_OAUTH_SERVER_CORS_ORIGINS`, comma separated). The `clients`' origins are added. */
    origins?: string[]
    /**
     * Path prefixes of the host's own API (`['/api/']`) the same origins may call with a bearer token: methods
     * `GET, POST, PUT, PATCH, DELETE, OPTIONS`, headers `authorization, content-type, accept`, `www-authenticate`
     * exposed. Defaults to none (`NUXT_OAUTH_SERVER_CORS_PATHS`, comma separated). `/oauth/authorize` stays closed.
     */
    paths?: string[]
  }
  /**
   * Applications defined in config rather than in the database, with a fixed `client_id` an app can ship with (a mobile
   * app, a single-page app). They are created on first use and kept in step with the config; staff can still disable
   * them, but not edit or delete them. `NUXT_OAUTH_SERVER_CLIENTS` (JSON) replaces the list at runtime.
   */
  clients?: OAuthConfiguredClient[]
  settings?: {
    // Expose this module's MCP tools, resources and prompts on the MCP endpoint. Defaults to `false`.
    mcp?: boolean
    pages?: {
      /** Consent screen. On by default (`/authorize`); pass `false` to provide your own page at that path. */
      authorize?: string | boolean
      /** Admin UI for applications. `true` = `/admin/oauth`. Needs `@nuxt/ui`. */
      admin?: string | boolean
      /** Admin UI for scopes. Defaults to `<admin>/scopes` when the applications admin is on; `false` turns it off. */
      scopes?: string | boolean
      /** The signed-in user's applications. `true` = `/account/applications`. Needs `@nuxt/ui`. */
      applications?: string | boolean
    }
    /** Where unauthenticated users are sent to sign in. Defaults to the `@frigear-nu/users` login page. */
    signInPath?: string
    /**
     * The most each role may grant to a client: scopes, permissions or wildcards per role name. A user's cap is the
     * union over their effective roles (inheritance included); a role that is not listed contributes nothing. Unset:
     * no cap beyond the user's permissions. Role names must be configured roles (checked at build time).
     */
    roleScopes?: Record<string, string[]>
  }
}

/** An application defined in `oauthServer.clients`. Only public clients (PKCE, no secret) can be configured. */
export type OAuthConfiguredClient = {
  /**
   * The `client_id`: 3 to 64 letters, digits, `.`, `_` or `-`, starting with a letter or digit, e.g. `mobile` or
   * `com.example.app`. Not `app_…`, which is the prefix of applications created in the admin UI.
   */
  id: string
  name: string
  /** Only `public` (the default): a configured client cannot hold a secret. */
  type?: 'public'
  /** Exact redirect URIs: https (http for localhost) or native app URIs such as `com.example.app:/auth/callback`. */
  redirectUris: string[]
  /** Extra redirect URIs accepted only in development (`nuxt dev`), e.g. `http://localhost:3001/auth/callback`. */
  devRedirectUris?: string[]
  /**
   * The application's origin. Defaults to the origin of the first web redirect URI; a native-only client has none.
   */
  websiteUrl?: string | null
  /** Shown in the users' application list. Defaults to `true`; `false` for apps users only open themselves. */
  listed?: boolean
  description?: string | null
  icon?: string | null
  /** Roles allowed to sign in (effective roles, inheritance included). Empty = every signed-in user. */
  allowedRoles?: string[]
  tags?: string[]
  /** May receive wildcard scopes (`*`, `resource:*`). Defaults to `false`. */
  wildcardScopes?: boolean
  /**
   * Origins added to `cors.origins` for this client. Defaults to the origins of its redirect URIs that have one
   * (`https://app.example.com`, `http://localhost:3001`, `capacitor://localhost`); `false` adds none.
   */
  corsOrigins?: string[] | false
  /**
   * How long this client's refresh tokens live, in seconds, instead of the global `refreshToken`: `idleTtl` (unused)
   * and `maxAge` (the whole sign-in). E.g. `{ idleTtl: 60 * 60 * 24 * 180 }` keeps a native app signed in while it is
   * opened at least every six months. At most two years each.
   */
  refreshToken?: { idleTtl?: number | null, maxAge?: number | null }
  /**
   * A browser client (one with a web redirect URI) above 7 days idle logs a warning, since its refresh tokens are
   * readable by any XSS. `true` says it is deliberate and silences it.
   */
  allowLongBrowserSessions?: boolean
}

/** A configured client after validation (`normalizeConfiguredClients`): what is written to the database. */
export type OAuthNormalizedClient = {
  id: string
  name: string
  clientType: 'public'
  websiteUrl: string | null
  isListed: boolean
  /** The redirect URIs, plus `devRedirectUris` in development. */
  redirectUris: string[]
  description: string | null
  icon: string | null
  allowedRoles: string[]
  tags: string[]
  wildcardScopes: boolean
  /** Origins this client adds to the CORS origins. */
  corsOrigins: string[]
  /** Its own refresh-token lifetimes; `null` = the global policy. */
  refreshToken: { idleTtl: number | null, maxAge: number | null }
  allowLongBrowserSessions: boolean
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
  /** The shared `aud` of access tokens; empty = the application's `client_id`. */
  accessTokenAudience: string[] | string
  /** The global refresh-token policy (`NUXT_OAUTH_SERVER_REFRESH_TOKEN_IDLE_TTL` / `..._MAX_AGE`). */
  refreshToken: { idleTtl: number, maxAge: number | null }
  revokeOnCredentialChange: boolean
  codeTtl: number
  callbackPath: string
  /** How `oauthServer.scopes` presents its scopes (named scopes and permission scopes) on the consent screen. */
  scopeDetails: OAuthScopeDefinition[]
  /** `settings.roleScopes`; `null` = no cap. */
  roleScopes: Record<string, string[]> | null
  /** Allowed CORS origins (`NUXT_OAUTH_SERVER_CORS_ORIGINS` takes a comma separated list). */
  corsOrigins: string[] | string
  /** Host API path prefixes open to the CORS origins (`NUXT_OAUTH_SERVER_CORS_PATHS` takes a comma separated list). */
  corsPaths: string[] | string
  /** The configured clients as given (`NUXT_OAUTH_SERVER_CLIENTS` takes JSON); validated again at runtime. */
  clients: OAuthConfiguredClient[] | string
  authorizePath: string
  signInPath?: string
}

export type PublicModuleOptions = {
  pages: { authorize?: string, admin?: string, scopes?: string, applications?: string }
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
  /** The application's origin. `null` for a public client without a website (a native app). */
  websiteUrl: string | null
  loginUrl: string | null
  previewUrlPattern: string | null
  /** Extra exact redirect URIs next to the derived `websiteUrl + callbackPath`. Public clients may list native (custom scheme) URIs. */
  redirectUris: string[]
  /** Roles allowed to sign in (effective roles). Empty = every signed-in user. */
  allowedRoles: string[]
  tags: string[]
  /** May receive wildcard scopes (`*`, `resource:*`). */
  wildcardScopes: boolean
  ownerId: number | null
  isActive: boolean
  /** Shown in the users' application list. Unlisted applications still sign in; users open them themselves. */
  isListed: boolean
  /** Refresh tokens live this long unused, in seconds. `null` = the configured client's value or the global one. */
  refreshIdleTtl: number | null
  /** A sign-in lives this long in total, in seconds. `null` = the configured client's value or the global one. */
  refreshMaxAge: number | null
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
  /** Required for confidential clients. A public client without one needs at least one redirect URI. */
  websiteUrl?: string | null
  description?: string | null
  icon?: string | null
  priority?: number
  loginUrl?: string | null
  previewUrlPattern?: string | null
  redirectUris?: string[]
  allowedRoles?: string[]
  tags?: string[]
  wildcardScopes?: boolean
  isActive?: boolean
  isListed?: boolean
  /** Session length: refresh tokens live this long unused, in seconds (at most two years). `null` = the default. */
  refreshIdleTtl?: number | null
  /** Sign in again after this long, in seconds (at most two years). `null` = the default. */
  refreshMaxAge?: number | null
}

export type TokenType = 'id_token' | 'access_token' | 'userinfo'

export type ApplicationAccessContext = {
  event?: H3Event
  user: OAuthUser
  application: OAuthApplication
  /** The user's effective roles (`getEffectiveRoles` of `@frigear-nu/auth`). */
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
  /** The user's effective roles. */
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
  /**
   * `revoked` (by the application or staff), `reuse_detected` (a rotated token was replayed), `user_grants_revoked`
   * (`revokeUserGrants`), `signed_out` (the user ended it under Signed-in apps) or `credentials_changed` (password or
   * email changed).
   */
  reason: 'revoked' | 'reuse_detected' | 'user_grants_revoked' | 'signed_out' | 'credentials_changed'
}

/** What the admin API returns (dates are ISO strings over the wire). */
export type AdminApplicationDto = Omit<OAuthApplication, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
  /** Refresh tokens that are still valid, i.e. users currently signed in. */
  activeGrants?: number
  /** The redirect URI the application has to accept; `null` without a website URL. */
  callbackUrl: string | null
  /**
   * Defined in `oauthServer.clients`: its name, website, redirect URIs, roles and tags come from config and cannot be
   * edited or deleted here (409 `managed_by_config`). It can still be disabled.
   */
  managed: boolean
  /** `confidential`, `browser` or `native`: decides whether a long session length is warned about. */
  kind: OAuthClientKind
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
  /** The requested scopes the user may grant: what the approval issues. */
  scope: string[]
  /** The requested scopes with whatever the server knows to present them (configured details, registered descriptions). */
  scopes?: OAuthScopeDefinition[]
  /** Requested scopes this user may not grant (no permission, or beyond their role's cap): left out of the token. */
  unavailable?: OAuthScopeDefinition[]
  /** `scopes` grouped by `service`, this server's own scopes (`service: null`) first. */
  groups?: OAuthScopeGroup[]
  user: { name: string, email: string, avatar: string | null }
}

/** The scopes of one service on the consent screen. */
export type OAuthScopeGroup = {
  /** `null` for this server's own scopes (the account). */
  service: string | null
  scopes: OAuthScopeDefinition[]
}

/**
 * An application the caller is signed in to, for the Signed-in apps list: every live sign-in (refresh-token family)
 * of the application, on any device, grouped into one entry.
 */
export type OAuthSessionDto = {
  /** The application id: what `DELETE /api/oauth-server/me/sessions/:id` signs out of, on every device. */
  id: string
  application: { id: string, name: string, icon: string | null }
  /** When the user first signed in to the application, of the sign-ins still live. */
  signedInAt: string
  /** When the application last refreshed its tokens (or signed in), on any device. */
  lastActiveAt: string
  /** When the last of its sign-ins ends unless the application refreshes before. */
  expiresAt: string
  /** How many live sign-ins (devices, browsers or app installs) the application has. */
  sessions: number
}
