import { z } from 'zod'
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

/**
 * The zod schema of a partial update, built from the registered definitions: a strict object, so an unknown key is
 * rejected, whose values satisfy their definition's schema or are `null` (which clears the preference).
 */
export function preferencePatchSchema(registry: Map<string, ResolvedPreference>) {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, definition] of registry) shape[key] = definition.schema.nullable().optional()
  return z.strictObject(shape)
}

/**
 * Validates a partial update with `preferencePatchSchema` and keeps only the keys the caller sent: a definition with
 * a `.default()` must not be written just because the key was left out. Throws a `ZodError` (h3 answers 400).
 */
export function parsePreferencePatch(registry: Map<string, ResolvedPreference>, body: unknown): Record<string, unknown> {
  const parsed: Record<string, unknown> = preferencePatchSchema(registry).parse(body)
  return Object.fromEntries(Object.keys(body as object).map(key => [key, parsed[key]]))
}

/** Applies a validated patch to the stored preferences: values set, `null` clears. */
export function applyPreferencePatch(
  stored: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...stored, ...patch }
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== null && value !== undefined))
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
