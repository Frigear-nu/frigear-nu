export interface AuthResolverDefinition {
  name: string
  /** Claims tokens that start with this prefix. */
  prefix?: string
  /** Claims tokens shaped like a JWT (three base64url segments). */
  jwt?: boolean
  /** Path to a module whose default export is an `AuthResolverFn`. */
  resolver: string
  /** Lower runs first. Defaults to 100. */
  order?: number
}

export interface AuthScopeDefinition {
  name: string
  description?: string
}

export interface ModuleOptions {
  /** Default lifetime in days for new user tokens; `null`/omitted means they never expire. */
  tokenTtlDays?: number | null
  /** Path to a module whose default export loads a user by id (overrides the one registered by `@frigear-nu/users`). */
  userLoader?: string
  /** Scopes registered by the host application. Modules register theirs with `addAuthScope`. */
  scopes?: AuthScopeDefinition[]
}
