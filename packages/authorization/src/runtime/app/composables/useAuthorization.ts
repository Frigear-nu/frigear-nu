import type { AccessDto, SharedPolicyDefinition } from '@frigear-nu/auth/policies'
import { authApi } from '@frigear-nu/auth/api'
import { accessAllows } from '../../utils/access'
import { policies as sharedPolicies } from '#auth/shared-policies'
import { computed, createError, useNuxtApp, useRequestFetch, useRuntimeConfig, useState, useUserSession } from '#imports'

type AccessLoad = Promise<AccessDto | null>

/** A signed-in client-mode user's `permissions` claim (the issuer's token), until the issuer's `/me/access` is wired in. */
function accessFromClaims(user: unknown): AccessDto | null {
  if (!user || typeof user !== 'object') return null
  const permissions = (user as { permissions?: unknown }).permissions
  return { kind: 'oauth', scopes: [], permissions: Array.isArray(permissions) ? permissions.filter(item => typeof item === 'string') : [] }
}

/**
 * What the visitor may do, for what the UI shows (the API decides what is allowed):
 *
 * - `access`: `GET /api/auth/me/access` (`{ kind, scopes, permissions, roles? }`), fetched during SSR, kept in
 *   `useState` and refreshed on sign-in and sign-out; `null` for guests.
 * - `can(permission, record?)`: synchronous. The exact `access.permissions` list, then the shared policies
 *   (`shared/policies.ts`) for the permission, which can only deny. `cannot` is its opposite.
 * - `authorize(permission, record?)`: throws a Nuxt error (401 for guests, 403 otherwise) when `can` is false.
 * - `refresh()`: fetches `access` again; `ensure()` fetches it only when it was never loaded.
 */
export function useAuthorization() {
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _authorizationAccess?: AccessLoad }
  const access = useState<AccessDto | null>('authorization:access', () => null)
  const loaded = useState<boolean>('authorization:access-loaded', () => false)
  const session = useUserSession()
  const client = !!useRuntimeConfig().public.authorization?.client
  // Forwards the request's cookies during SSR; plain `$fetch` in the browser.
  const fetcher = useRequestFetch()

  function refresh(): AccessLoad {
    nuxtApp._authorizationAccess = (async () => {
      if (client) {
        // TODO(phase 2, client mode): ask the issuer's `/api/auth/me/access` with the bearer token, falling back to the claim.
        access.value = session.loggedIn.value ? accessFromClaims(session.user.value) : null
      }
      else {
        try {
          access.value = await fetcher<AccessDto>(authApi.me.access)
        }
        catch {
          access.value = null
        }
      }
      loaded.value = true
      return access.value
    })()
    return nuxtApp._authorizationAccess
  }

  function ensure(): AccessLoad {
    if (loaded.value) return Promise.resolve(access.value)
    return nuxtApp._authorizationAccess ?? refresh()
  }

  function can<R = unknown>(permission: string, record?: R): boolean {
    return accessAllows(access.value, permission, {
      record,
      user: session.user.value ?? null,
      policies: sharedPolicies as readonly SharedPolicyDefinition<R>[],
    })
  }

  function cannot<R = unknown>(permission: string, record?: R): boolean {
    return !can(permission, record)
  }

  function authorize<R = unknown>(permission: string, record?: R): void {
    if (can(permission, record)) return
    throw createError(access.value
      ? { statusCode: 403, statusMessage: 'Forbidden', message: 'You are not allowed to do that.' }
      : { statusCode: 401, statusMessage: 'Unauthorized', message: 'Authentication required' })
  }

  return { access: computed(() => access.value), can, cannot, authorize, refresh, ensure }
}
