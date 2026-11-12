import { principalHasScopes } from '@frigear-nu/auth/utils'
import type { AuthPrincipal } from '@frigear-nu/auth/utils'
import { z } from 'zod'

/** Marker set on every definition created through the scoped definers; anything without it is dropped. */
export const SCOPED_META_KEY = 'frigear-nu/scoped'

export interface ScopedAccess {
  /**
   * The permission (`resource:action`) the caller must be allowed, checked with `allows(event, permission)`. Its
   * definition says whether it is session only. Replaces `scopes`, `sessionOnly` and `gate`.
   */
  permission?: string
  /**
   * Scopes the caller's credential must carry. Required: a definition without scopes is never exposed.
   * @deprecated Use `permission`; removed once definitions are checked by permission.
   */
  scopes: string[]
  /**
   * Never exposed to bearer credentials (API tokens, OAuth); only to a cookie session.
   * @deprecated Use a `sessionOnly` permission as `permission`.
   */
  sessionOnly?: boolean
}

/**
 * Pure part of the access decision: is there a principal, does it carry the scopes (within its
 * user's permissions), is the credential kind allowed. Module-specific gates (e.g. `events:authorize`) layer on top.
 */
export function isPrincipalAllowed(principal: AuthPrincipal | null | undefined, access: ScopedAccess): principal is AuthPrincipal {
  if (!principal) return false
  if (!access.scopes.length) return false
  if (access.sessionOnly && principal.kind !== 'session') return false
  return principalHasScopes(principal, access.scopes)
}

export function scopeTags(access: ScopedAccess): string[] {
  return [...access.scopes.map(scope => `scope:${scope}`), ...(access.sessionOnly ? ['session-only'] : [])]
}

export interface RedactOptions<T extends object> {
  /** Whether the caller may see identifying fields. */
  allow: boolean
  /** Fields that identify a person or hold their answers. */
  fields: ReadonlyArray<keyof T>
}

/**
 * Removes identifying fields unless explicitly allowed. Use together with an explicit allow-list of
 * output fields: never pass a raw database row through.
 */
export function redactPii<T extends object>(row: T, options: RedactOptions<T>): Partial<T> {
  if (options.allow) return { ...row }
  const hidden = new Set<PropertyKey>(options.fields)
  return Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.has(key))) as Partial<T>
}

/** Picks an explicit allow-list of keys, so a new database column is never exposed by accident. */
export function pick<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) result[key] = row[key]
  return result
}

/**
 * Message for the agent when identifying fields were withheld, so it can tell the user why instead
 * of guessing or retrying. Undefined when nothing was withheld.
 */
export function piiNotice(allowed: boolean, scope: string, fields: string): string | undefined {
  if (allowed) return undefined
  return `${fields} are withheld because this credential lacks the "${scope}" scope. This is intentional privacy protection; do not look for another way to obtain them. If the user needs them, ask them to create an API token that also has the "${scope}" scope.`
}

interface McpListConfig {
  tools?: { name?: string, inputSchema?: unknown, _meta?: Record<string, unknown> }[]
  resources?: { _meta?: Record<string, unknown> }[]
  prompts?: { _meta?: Record<string, unknown> }[]
}

/**
 * Drops, in place, every tool/resource/prompt that was not created through a scoped definer, and every tool whose
 * input schema cannot be described as JSON Schema (zod transforms, coerced dates, ...: one such tool would make
 * `tools/list` fail for every caller). Fails closed: should the filtering itself throw (a list missing, a malformed
 * definition), the lists are emptied instead of being left unfiltered.
 */
export function filterMcpConfig(config: McpListConfig): void {
  const scoped = (definition: { _meta?: Record<string, unknown> }) => definition._meta?.[SCOPED_META_KEY] === true
  const serializable = (tool: { name?: string, inputSchema?: unknown }) => {
    if (!tool.inputSchema) return true
    try {
      z.toJSONSchema(z.object(tool.inputSchema as z.ZodRawShape), { io: 'input' })
      return true
    }
    catch (error) {
      console.error(`[mcp] dropping tool "${tool.name}": its input schema is not JSON Schema compatible`, error)
      return false
    }
  }
  try {
    const tools = (config.tools ?? []).filter(scoped).filter(serializable)
    const resources = (config.resources ?? []).filter(scoped)
    const prompts = (config.prompts ?? []).filter(scoped)
    config.tools = tools
    config.resources = resources
    config.prompts = prompts
  }
  catch (error) {
    console.error('[mcp] could not filter the definitions, hiding them all', error)
    config.tools = []
    config.resources = []
    config.prompts = []
  }
}
