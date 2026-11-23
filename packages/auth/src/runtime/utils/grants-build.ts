import type { Nuxt } from '@nuxt/schema'
import type { GrantKindRegistration } from './grants'
import { GRANT_KIND_PATTERN } from './grants'

// Kept on the Nuxt options (not a hook) so `registeredGrantKinds` can read them synchronously at `modules:done`.
type GrantsHost = { _authGrantKinds?: GrantKindRegistration[] }

/**
 * Build-time API: registers grant kinds from a module's own `setup()`. Registration order between modules does not
 * matter; auth bundles every kind once all modules are done. A kind registered again replaces the earlier one.
 *
 * ```ts
 * import { extendGrants } from '@frigear-nu/auth/utils'
 *
 * extendGrants(nuxt, {
 *   kind: 'team',
 *   label: 'Team',
 *   server: resolver.resolve('./runtime/server/grants/team'),
 *   field: resolver.resolve('./runtime/app/components/TeamGrantField.vue'),
 *   defaults: { teamId: '', minRole: '' },
 * })
 * ```
 */
export function extendGrants(nuxt: Nuxt, kinds: GrantKindRegistration | GrantKindRegistration[]): void {
  const host = nuxt.options as unknown as GrantsHost
  const list = host._authGrantKinds ||= []
  for (const kind of Array.isArray(kinds) ? kinds : [kinds]) {
    if (!GRANT_KIND_PATTERN.test(kind.kind)) throw new Error(`[auth] "${kind.kind}" is not a valid grant kind name.`)
    const existing = list.findIndex(item => item.kind === kind.kind)
    if (existing === -1) list.push({ ...kind })
    else list[existing] = { ...kind }
  }
}

/** The grant kinds registered so far (auth reads them once every module is done). */
export function registeredGrantKinds(nuxt: Nuxt): GrantKindRegistration[] {
  return [...((nuxt.options as unknown as GrantsHost)._authGrantKinds ?? [])]
}
