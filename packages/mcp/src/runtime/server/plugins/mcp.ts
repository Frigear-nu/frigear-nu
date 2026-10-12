import type { H3Event } from 'h3'
import type { CallToolResult, McpResolvedConfig } from '@nuxtjs/mcp-toolkit/server'
import { defineNitroPlugin } from 'nitropack/runtime'
import { z } from 'zod'
import { SCOPED_META_KEY } from '../../utils/access'

// The toolkit's own runtime hook types are only augmented when its module types are loaded.
declare module 'nitropack' {
  interface NitroRuntimeHooks {
    'mcp:config:resolved': (ctx: { config: McpResolvedConfig, event: H3Event }) => void | Promise<void>
    'mcp:tool:called': (ctx: { name: string, result: CallToolResult, durationMs: number, event: H3Event }) => void | Promise<void>
  }
}

/**
 * Defence in depth around the scoped definers:
 * - fail closed: a definition that was not created through `defineScopedMcp*` (no marker) is dropped;
 * - audit: who called which tool, never the arguments or the result.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('mcp:config:resolved', ({ config }) => {
    const scoped = <T extends { _meta?: Record<string, unknown> }>(definition: T) => definition._meta?.[SCOPED_META_KEY] === true
    // One tool whose input cannot be described as JSON Schema (zod transforms, coerced dates, ...)
    // would otherwise make `tools/list` fail for every caller, so it is dropped and logged.
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
    config.tools = config.tools.filter(scoped).filter(serializable)
    config.resources = config.resources.filter(scoped)
    config.prompts = config.prompts.filter(scoped)
  })

  nitroApp.hooks.hook('mcp:tool:called', ({ name, result, durationMs, event }) => {
    const principal = event.context.auth
    console.info('[mcp] tool called', JSON.stringify({
      tool: name,
      userId: principal?.user.id ?? null,
      credential: principal?.kind ?? null,
      outcome: result.isError ? 'error' : 'success',
      durationMs,
    }))
  })
})
