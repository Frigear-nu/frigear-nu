import type { z } from 'zod'
import type { PreferenceDefinitions } from '../define'

export interface ResolvedPreference {
  key: string
  schema: z.ZodType
  /** Name of the OAuth claim the value is forwarded as, if any. */
  claim?: string
  /** Scope an application needs to receive the claim. */
  scope: string
}

const isSchema = (value: unknown): value is z.ZodType =>
  typeof (value as { safeParse?: unknown } | null)?.safeParse === 'function'

/** Flattens the registered definer files into one lookup. The same key in two files is a mistake worth failing on. */
export function resolvePreferences(sources: PreferenceDefinitions[]): Map<string, ResolvedPreference> {
  const registry = new Map<string, ResolvedPreference>()
  for (const source of sources) {
    for (const [key, definition] of Object.entries(source)) {
      if (registry.has(key)) throw new Error(`[preferences] "${key}" is defined more than once.`)
      const resolved = isSchema(definition)
        ? { key, schema: definition, scope: 'profile' }
        : { key, schema: definition.schema, claim: definition.claim, scope: definition.scope ?? 'profile' }
      registry.set(key, resolved)
    }
  }
  return registry
}

export type PreferencePatchResult
  = { ok: true, set: Record<string, unknown>, remove: string[] }
    | { ok: false, message: string }

/**
 * Validates a partial update: every key must be registered, a value must satisfy its schema, and `null` clears
 * the preference.
 */
export function parsePreferencePatch(registry: Map<string, ResolvedPreference>, body: unknown): PreferencePatchResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Expected an object of preferences.' }
  const set: Record<string, unknown> = {}
  const remove: string[] = []
  for (const [key, value] of Object.entries(body)) {
    const definition = registry.get(key)
    if (!definition) return { ok: false, message: `Unknown preference "${key}".` }
    if (value === null) {
      remove.push(key)
      continue
    }
    const parsed = definition.schema.safeParse(value)
    if (!parsed.success) return { ok: false, message: `Invalid value for "${key}".` }
    set[key] = parsed.data
  }
  return { ok: true, set, remove }
}

/** The stored value when it still satisfies the schema, so a changed schema never leaks stale data. */
export function readPreference(registry: Map<string, ResolvedPreference>, stored: unknown, key: string): unknown {
  const definition = registry.get(key)
  if (!definition || !stored || typeof stored !== 'object' || !(key in stored)) return undefined
  const parsed = definition.schema.safeParse((stored as Record<string, unknown>)[key])
  return parsed.success ? parsed.data : undefined
}

/** The claims to add for a token: only preferences that opted in, only when the scope was granted. */
export function preferenceClaims(
  registry: Map<string, ResolvedPreference>,
  stored: unknown,
  ctx: { tokenType: string, scope: string[] },
): Record<string, unknown> {
  // Access tokens stay bare, like every other identity claim.
  if (ctx.tokenType === 'access_token') return {}
  const claims: Record<string, unknown> = {}
  for (const definition of registry.values()) {
    if (!definition.claim || !ctx.scope.includes(definition.scope)) continue
    const value = readPreference(registry, stored, definition.key)
    if (value !== undefined) claims[definition.claim] = value
  }
  return claims
}
