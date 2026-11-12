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
import type { AuthPrincipal, AuthUser } from '@frigear-nu/auth/utils'
import { SCOPED_META_KEY, permissionTags } from '../../utils/access'
import type { ScopedAccess } from '../../utils/access'

type ShapeOutput<Shape extends ZodRawShape> = z.output<z.ZodObject<Shape>>

export interface ScopedMcpContext {
  event: H3Event
  principal: AuthPrincipal
  /** The authenticated user. "My …" tools must use this and never take a user id as an argument. */
  user: AuthUser
  /**
   * Whether the caller (this credential, within its user's current permissions) is allowed `permission`, for example
   * an opt-in `*:pii` permission, optionally for a `record` (policies). Backed by `allows`; it never answers for
   * another user.
   */
  can: (permission: string, record?: unknown) => Promise<boolean>
}

/**
 * The one access option of every scoped definition. Besides the toolkit's own options, a definition takes
 * `permission` and nothing else: `scopes`, `sessionOnly` and `gate` were removed (use a `sessionOnly` permission, a
 * policy or an `authorization:before` listener).
 */
export type ScopedOptions = ScopedAccess

/**
 * Whether the caller may see and use the definition. Runs on every listing, so a caller who is not allowed never
 * sees it. A failing check hides the definition (fail closed) instead of breaking the whole listing.
 */
async function isAllowed(event: H3Event, options: ScopedOptions): Promise<boolean> {
  try {
    return await allows(event, options.permission)
  }
  catch (error) {
    console.error('[mcp] access check failed, hiding definition', error)
    return false
  }
}

function toContext(event: H3Event, principal: AuthPrincipal): ScopedMcpContext {
  return {
    event,
    principal,
    user: principal.user,
    can: (permission, record) => allows(event, permission, record),
  }
}

/**
 * Authorises the in-flight request. Listing-time hiding is not authorisation (sessions freeze the
 * list), so every handler re-checks with `authorize`: 401 `unauthorized`, 403 `session_required`,
 * `insufficient_scope` or `forbidden`, which the toolkit turns into `isError`.
 */
export async function authorizeMcp(options: ScopedOptions): Promise<ScopedMcpContext> {
  const event = useEvent()
  const principal = await authorize(event, options.permission)
  return toContext(event, principal)
}

function assertPermission(kind: string, options: ScopedOptions) {
  if (typeof options.permission !== 'string' || !options.permission) {
    throw new Error(`[mcp] A ${kind} must declare a \`permission\`; definitions without one are never exposed.`)
  }
}

function guarded(options: ScopedOptions, meta?: Record<string, unknown>) {
  return {
    tags: permissionTags(options),
    _meta: { ...meta, [SCOPED_META_KEY]: true, 'frigear-nu/permission': options.permission },
    enabled: (event: H3Event) => isAllowed(event, options),
  }
}

export type ScopedMcpToolDefinition<Shape extends ZodRawShape = ZodRawShape> = Omit<McpToolDefinition<Shape>, 'handler' | 'enabled' | 'inputSchema'> & ScopedOptions & {
  tags?: string[]
  inputSchema?: Shape
  handler: (args: ShapeOutput<Shape>, ctx: ScopedMcpContext, extra: McpRequestExtra) => McpToolCallbackResult | Promise<McpToolCallbackResult>
}

/** An MCP tool that is listed and callable only by a caller who is allowed its `permission`. */
export function defineScopedMcpTool<const Shape extends ZodRawShape = Record<string, never>>(definition: ScopedMcpToolDefinition<Shape>) {
  assertPermission('tool', definition)
  const { permission: _permission, handler, tags, _meta, inputSchema, ...rest } = definition
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
  assertPermission('resource', definition)
  const { permission: _permission, handler, tags, _meta, ...rest } = definition
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
  assertPermission('prompt', definition)
  const { permission: _permission, handler, tags, _meta, ...rest } = definition
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
