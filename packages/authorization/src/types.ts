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
  /**
   * Declarative route rules, keyed by pattern (`/admin/**`, `/posts/*`, exact path). Page rules apply to
   * navigation; `/api/**` rules also apply to server requests. All matching rules must pass.
   * `definePageMeta({ authorize })` replaces the matching rules for that page.
   */
  routes?: Record<string, Omit<RouteRule, 'args'> & { ability?: string }>
  /** Where to send unauthenticated visitors on page navigation. Omit to show a 401 error instead. */
  redirectTo?: string
}

export interface PublicModuleOptions {
  routes?: ModuleOptions['routes']
  redirectTo?: string
}

declare module '#app' {
  interface PageMeta {
    authorize?: AuthorizeMeta
  }
}
