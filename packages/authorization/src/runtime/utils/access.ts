import { runSharedPolicies } from '@frigear-nu/auth/policies'
import type { AccessDto, SharedPolicyDefinition } from '@frigear-nu/auth/policies'

export interface AccessCheck<R = unknown, TUser = unknown> {
  /** The record the check is about: shared policies for the permission refine the result. */
  record?: R
  /** The signed-in user, handed to shared policies. */
  user?: TUser | null
  /** Every shared policy (`shared/policies.ts`); only those for the permission run. */
  policies?: readonly SharedPolicyDefinition<R, TUser>[]
}

/**
 * The client's `can()`: whether `access` (`GET /api/auth/me/access`) lists the permission, then the shared policies for
 * it, which can only deny (`false`, or a policy that throws). `access.permissions` is the exact list the server computed
 * (roles, `authorization:before`), so wildcards are never expanded here. For what the UI shows: the API decides.
 */
export function accessAllows<R = unknown, TUser = unknown>(access: AccessDto | null | undefined, permission: string, check: AccessCheck<R, TUser> = {}): boolean {
  if (!access || !access.permissions.includes(permission)) return false
  const policies = (check.policies ?? []).filter(policy => policy.permission === permission)
  if (!policies.length) return true
  const outcomes = runSharedPolicies(policies, { user: check.user ?? null, access, record: check.record, granted: true })
  const hasRecord = check.record !== undefined
  return outcomes
    .filter(outcome => hasRecord || outcome.withoutRecord)
    .every(outcome => outcome.result !== false && outcome.result !== 'throw')
}

/** The shared policy definitions among a module's exports (`import * as policies from 'shared/policies'`). */
export function collectSharedPolicies(exports: Record<string, unknown>): SharedPolicyDefinition[] {
  const found: SharedPolicyDefinition[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (value && typeof value === 'object' && (value as { shared?: unknown }).shared === true
      && typeof (value as { permission?: unknown }).permission === 'string'
      && typeof (value as { handler?: unknown }).handler === 'function') {
      found.push(value as SharedPolicyDefinition)
    }
  }
  Object.values(exports).forEach(visit)
  return found
}
