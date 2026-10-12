import type { H3Event } from 'h3'
import type { ZodRawShape, z } from 'zod'
import { defineMcpPrompt, defineMcpResource, defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import type {
  McpPromptCallbackResult,
  McpPromptDefinition,
  McpRequestExtra,
  McpToolCallbackResult,
  McpToolDefinition,
  StandardMcpResourceDefinition,
} from '@nuxtjs/mcp-toolkit/server'
import { hasScopes } from '@frigear-nu/auth/utils'
import type { AuthPrincipal, AuthUser } from '@frigear-nu/auth/utils'
import { SCOPED_META_KEY, isPrincipalAllowed, scopeTags } from '../../utils/access'
import type { ScopedAccess } from '../../utils/access'

type ShapeOutput<Shape extends ZodRawShape> = z.output<z.ZodObject<Shape>>

export interface ScopedMcpContext {
  event: H3Event
  principal: AuthPrincipal
  /** The authenticated user. "My …" tools must use this and never take a user id as an argument. */
  user: AuthUser
  /** Whether the credential carries `scope` (e.g. an opt-in `*:pii` scope). */
  hasScope: (scope: string) => boolean
}

/**
 * Extra, module-specific check layered on the scopes, typically the module's `*:authorize` policy
 * hook. It runs on every listing and every call, so a caller the host does not allow never sees
 * the definition. Identify the caller from `principal.user.id`, never from the session on `event`.
 */
export type ScopedGate = (event: H3Event, principal: AuthPrincipal) => boolean | Promise<boolean>

export interface ScopedOptions extends ScopedAccess {
  gate?: ScopedGate
}

async function isAllowed(event: H3Event, options: ScopedOptions): Promise<AuthPrincipal | null> {
  const principal = await getAuth(event)
  if (!isPrincipalAllowed(principal, options)) return null
  if (!options.gate) return principal
  // A failing policy hook hides the definition (fail closed) instead of breaking the whole listing.
  try {
    return (await options.gate(event, principal)) ? principal : null
  }
  catch (error) {
    console.error('[mcp] gate failed, hiding definition', error)
    return null
  }
}

function toContext(event: H3Event, principal: AuthPrincipal): ScopedMcpContext {
  return {
    event,
    principal,
    user: principal.user,
    hasScope: scope => hasScopes(principal.scopes, [scope]),
  }
}

/**
 * Authorises the in-flight request. Listing-time hiding is not authorisation (sessions freeze the
 * list), so every handler re-checks. Failures are 401/403 errors the toolkit turns into `isError`.
 */
export async function authorizeMcp(options: ScopedOptions): Promise<ScopedMcpContext> {
  const event = useEvent()
  const principal = await getAuth(event)
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (options.sessionOnly && principal.kind !== 'session') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', data: { error: 'session_required' } })
  }
  if (!hasScopes(principal.scopes, options.scopes)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', data: { error: 'insufficient_scope', scopes: options.scopes } })
  }
  if (options.gate && !(await options.gate(event, principal))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return toContext(event, principal)
}

function assertScoped(kind: string, options: ScopedOptions) {
  if (!options.scopes?.length) {
    throw new Error(`[mcp] A ${kind} must declare at least one scope; unscoped definitions are never exposed.`)
  }
}

function guarded(options: ScopedOptions, meta?: Record<string, unknown>) {
  return {
    tags: scopeTags(options),
    _meta: { ...meta, [SCOPED_META_KEY]: true, 'frigear-nu/scopes': options.scopes },
    enabled: async (event: H3Event) => (await isAllowed(event, options)) !== null,
  }
}

export type ScopedMcpToolDefinition<Shape extends ZodRawShape = ZodRawShape> = Omit<McpToolDefinition<Shape>, 'handler' | 'enabled' | 'inputSchema'> & ScopedOptions & {
  tags?: string[]
  inputSchema?: Shape
  handler: (args: ShapeOutput<Shape>, ctx: ScopedMcpContext, extra: McpRequestExtra) => McpToolCallbackResult | Promise<McpToolCallbackResult>
}

/** An MCP tool that is listed and callable only within the scopes (and gate) the caller satisfies. */
export function defineScopedMcpTool<const Shape extends ZodRawShape = Record<string, never>>(definition: ScopedMcpToolDefinition<Shape>) {
  assertScoped('tool', definition)
  const { scopes: _scopes, sessionOnly: _sessionOnly, gate: _gate, handler, tags, _meta, inputSchema, ...rest } = definition
  const base = guarded(definition, _meta)
  return defineMcpTool({
    ...rest,
    inputSchema: (inputSchema ?? {}) as Shape,
    tags: [...base.tags, ...(tags ?? [])],
    _meta: base._meta,
    enabled: base.enabled,
    handler: (async (args: ShapeOutput<Shape>, extra: McpRequestExtra) => handler(args, await authorizeMcp(definition), extra)) as McpToolDefinition<Shape>['handler'],
  } as McpToolDefinition<Shape>)
}

export type ScopedMcpResourceDefinition = Omit<StandardMcpResourceDefinition, 'handler' | 'enabled'> & ScopedOptions & {
  handler: (ctx: ScopedMcpContext, ...args: Parameters<StandardMcpResourceDefinition['handler']>) => ReturnType<StandardMcpResourceDefinition['handler']>
}

export function defineScopedMcpResource(definition: ScopedMcpResourceDefinition) {
  assertScoped('resource', definition)
  const { scopes: _scopes, sessionOnly: _sessionOnly, gate: _gate, handler, tags, _meta, ...rest } = definition
  const base = guarded(definition, _meta)
  return defineMcpResource({
    ...rest,
    tags: [...base.tags, ...(tags ?? [])],
    _meta: base._meta,
    enabled: base.enabled,
    handler: (async (...args: unknown[]) => (handler as (...a: unknown[]) => unknown)(await authorizeMcp(definition), ...args)) as StandardMcpResourceDefinition['handler'],
  } as StandardMcpResourceDefinition)
}

export type ScopedMcpPromptDefinition<Shape extends ZodRawShape | undefined = undefined> = Omit<McpPromptDefinition<Shape>, 'handler' | 'enabled'> & ScopedOptions & {
  handler: (args: Shape extends ZodRawShape ? ShapeOutput<Shape> : Record<string, never>, ctx: ScopedMcpContext) => McpPromptCallbackResult | Promise<McpPromptCallbackResult>
}

export function defineScopedMcpPrompt<const Shape extends ZodRawShape | undefined = undefined>(definition: ScopedMcpPromptDefinition<Shape>) {
  assertScoped('prompt', definition)
  const { scopes: _scopes, sessionOnly: _sessionOnly, gate: _gate, handler, tags, _meta, ...rest } = definition
  const base = guarded(definition, _meta)
  return defineMcpPrompt({
    ...rest,
    tags: [...base.tags, ...(tags ?? [])],
    _meta: base._meta,
    enabled: base.enabled,
    handler: (async (...args: unknown[]) => {
      const ctx = await authorizeMcp(definition)
      // With an input schema the SDK passes `(args, extra)`, without one just `(extra)`.
      return (handler as (a: unknown, c: ScopedMcpContext) => unknown)(definition.inputSchema ? args[0] : {}, ctx)
    }) as McpPromptDefinition<Shape>['handler'],
  } as McpPromptDefinition<Shape>)
}

// Auto-imported alongside the definers, so tools redact through one code path.
export { pick, piiNotice, redactPii } from '../../utils/access'
