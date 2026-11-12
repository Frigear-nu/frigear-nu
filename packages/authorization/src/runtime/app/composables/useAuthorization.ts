import type { Permission } from '@frigear-nu/auth/access'
import type { AccessDto, SharedPolicyDefinition } from '@frigear-nu/auth/policies'
import { authApi } from '@frigear-nu/auth/api'
import { accessAllows } from '../../utils/access'
import { policies as sharedPolicies } from '#auth/shared-policies'
import { computed, createError, useNuxtApp, useRequestFetch, useRuntimeConfig, useState, useUserSession } from '#imports'

type AccessLoad = Promise<AccessDto | null>

/** Client mode's loader, provided by `@frigear-nu/auth` (`$authAccess`): the issuer's `/me/access`, else the token's claim. */
type AuthClientAccess = () => Promise<AccessDto | null>

/**
 * What the visitor may do, for what the UI shows (the API decides what is allowed):
 *
 * - `access`: `GET /api/auth/me/access` (`{ kind, scopes, permissions, roles? }`), fetched during SSR, kept in
 *   `useState` and refreshed on sign-in and sign-out; `null` for guests.
 * - `can(permission, record?)`: synchronous. The exact `access.permissions` list, then the shared policies
 *   (`shared/policies.ts`) for the permission, which can only deny. `cannot` is its opposite.
 * - `authorize(permission, record?)`: throws a Nuxt error (401 for guests, 403 otherwise) when `can` is false.
 * - `refresh()`: fetches `access` again (and bumps `useState('access:version')`, so menus, widgets and tabs filter
 *   again); `ensure()` fetches it only when it was never loaded.
 *
 * In client mode (`authentication.mode: 'client'`, such as `@frigear-nu/mobile`) `access` comes from the issuer's
 * `GET /api/auth/me/access` with the bearer access token, or, when the issuer has no such endpoint (a 404, offline),
 * from the access token's `permissions` claim, decoded without verification.
 *
 * Every check here is UI only (what to show, which page to open): the server enforces the permissions on each request.
 */
export function useAuthorization() {
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _authorizationAccess?: AccessLoad }
  const access = useState<AccessDto | null>('authorization:access', () => null)
  const loaded = useState<boolean>('authorization:access-loaded', () => false)
  // Read by `useMenu` (`@frigear-nu/menu`), `useWidgets` and `useTabs` (`@frigear-nu/widget`) in their cache keys.
  const version = useState<number>('access:version', () => 0)
  const session = useUserSession()
  const client = !!useRuntimeConfig().public.authorization?.client
  // Forwards the request's cookies during SSR; plain `$fetch` in the browser.
  const fetcher = useRequestFetch()

  function refresh(): AccessLoad {
    nuxtApp._authorizationAccess = (async () => {
      try {
        if (client) {
          const load = (nuxtApp as unknown as { $authAccess?: AuthClientAccess }).$authAccess
          access.value = session.loggedIn.value && load ? await load() : null
        }
        else {
          access.value = await fetcher<AccessDto>(authApi.me.access)
        }
      }
      catch {
        access.value = null
      }
      loaded.value = true
      version.value++
      return access.value
    })()
    return nuxtApp._authorizationAccess
  }

  function ensure(): AccessLoad {
    // The latest load (also one still running, such as client mode's first load after hydration), else the state.
    if (nuxtApp._authorizationAccess) return nuxtApp._authorizationAccess
    if (loaded.value) return Promise.resolve(access.value)
    return refresh()
  }

  function can<R = unknown>(permission: Permission, record?: R): boolean {
    return accessAllows(access.value, permission, {
      record,
      user: session.user.value ?? null,
      policies: sharedPolicies as readonly SharedPolicyDefinition<R>[],
    })
  }

  function cannot<R = unknown>(permission: Permission, record?: R): boolean {
    return !can(permission, record)
  }

  function authorize<R = unknown>(permission: Permission, record?: R): void {
    if (can(permission, record)) return
    throw createError(access.value
      ? { statusCode: 403, statusMessage: 'Forbidden', message: 'You are not allowed to do that.' }
      : { statusCode: 401, statusMessage: 'Unauthorized', message: 'Authentication required' })
  }

  return { access: computed(() => access.value), can, cannot, authorize, refresh, ensure }
}
