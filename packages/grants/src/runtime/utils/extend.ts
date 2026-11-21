import type { Nuxt } from '@nuxt/schema'
import type { GrantKindRegistration } from '../../types'
import { GRANT_KIND_PATTERN } from './core'

type GrantsHost = { grants?: { _kinds?: GrantKindRegistration[] } }

/**
 * Build-time API: registers grant kinds from a module's own `setup()`. Registration order between modules does not
 * matter; the grants module bundles every kind once all modules are done. A kind registered again replaces the earlier
 * one.
 *
 * ```ts
 * import { extendGrants } from '@frigear-nu/grants/utils'
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
  host.grants ||= {}
  const list = host.grants._kinds ||= []
  for (const kind of Array.isArray(kinds) ? kinds : [kinds]) {
    if (!GRANT_KIND_PATTERN.test(kind.kind)) throw new Error(`[grants] "${kind.kind}" is not a valid grant kind name.`)
    const existing = list.findIndex(item => item.kind === kind.kind)
    if (existing === -1) list.push({ ...kind })
    else list[existing] = { ...kind }
  }
}

/** The kinds registered so far (the grants module reads them once every module is done). */
export function registeredGrantKinds(nuxt: Nuxt): GrantKindRegistration[] {
  return [...((nuxt.options as unknown as GrantsHost).grants?._kinds ?? [])]
}
