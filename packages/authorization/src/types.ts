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
 * Authorization keys that go directly on a `routeRules` entry. Ability names refer to exports of the abilities
 * file and take no arguments.
 */
export type AuthorizationRouteRules = Omit<RouteRule, 'args' | 'ability'> & { ability?: string }

export interface PublicModuleOptions {
  /** The authorization keys of `routeRules`, collected at build time. */
  routes?: Record<string, AuthorizationRouteRules>
  redirectTo?: string
}

declare module 'nitropack' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the authorization keys into route rules
  interface NitroRouteConfig extends AuthorizationRouteRules {}
}

declare module 'nitropack/types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the authorization keys into route rules
  interface NitroRouteConfig extends AuthorizationRouteRules {}
}

declare module '#app' {
  interface PageMeta {
    authorize?: AuthorizeMeta
  }
}
