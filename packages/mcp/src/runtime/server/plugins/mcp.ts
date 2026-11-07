import type { H3Event } from 'h3'
import type { CallToolResult, McpResolvedConfig } from '@nuxtjs/mcp-toolkit/server'
import { defineNitroPlugin } from 'nitropack/runtime'
import { filterMcpConfig } from '../../utils/access'

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
  // Fails closed: if the filter throws, the toolkit only logs it and would keep every definition listed.
  nitroApp.hooks.hook('mcp:config:resolved', ({ config }) => {
    filterMcpConfig(config)
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
