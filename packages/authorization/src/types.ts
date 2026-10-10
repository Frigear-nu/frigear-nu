import type { AuthorizeMeta, RouteRule } from './runtime/utils/types'

export type { Ability, AbilityArgs, AuthorizeMeta, RouteRule, AuthorizationResponse } from './runtime/utils/types'

export interface ModuleOptions {
  /**
   * Path to the file whose exports are the app's abilities (`defineAbility(...)`). Required to refer to
   * abilities by name in `routes`/`definePageMeta`. Defaults to `shared/utils/abilities.ts` (auto-imported in app and server) or `shared/abilities.ts`.
   */
  abilities?: string
  /** Override how the user is resolved (paths to default-export functions). Defaults to the session user. */
  resolvers?: {
    /** `(event: H3Event) => User | null | Promise<User | null>` */
    server?: string
    /** `() => User | null | Promise<User | null>` - runs in the app (client and SSR). */
    client?: string
  }
  /** Where to send unauthenticated visitors on page navigation. Omit to show a 401 error instead. */
  redirectTo?: string
}

/**
 * The value of `routeRules[pattern].authorization`: a rule, `true` (any logged-in user) or `false` (open up a
 * sub-route of a protected pattern). Ability names refer to exports of the abilities file and take no arguments.
 */
export type AuthorizationRouteRule = Omit<RouteRule, 'args' | 'ability'> & { ability?: string } | boolean

export interface PublicModuleOptions {
  /** Collected from `routeRules[...].authorization` at build time. */
  routes?: Record<string, AuthorizationRouteRule>
  redirectTo?: string
}

declare module 'nitropack' {
  interface NitroRouteConfig {
    authorization?: AuthorizationRouteRule
  }
}

declare module 'nitropack/types' {
  interface NitroRouteConfig {
    authorization?: AuthorizationRouteRule
  }
}

declare module '#app' {
  interface PageMeta {
    authorize?: AuthorizeMeta
  }
}
