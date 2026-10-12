import type { Nuxt } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type McpDefinitionKind = 'tools' | 'resources' | 'prompts'

interface McpDefinitionPaths {
  tools: string[]
  resources: string[]
  prompts: string[]
  handlers: string[]
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'mcp:definitions:paths': (paths: McpDefinitionPaths) => void | Promise<void>
  }
}

/**
 * Register a module's MCP definitions. `dir` is an absolute directory laid out like a project's
 * `server/mcp`: `tools/`, `resources/` and `prompts/` subfolders (each optional). Subfolders of
 * `tools/` become tool groups, so `tools/admin/…` is grouped as `admin`.
 *
 * Every definition must be created with `defineScopedMcpTool` / `defineScopedMcpResource` /
 * `defineScopedMcpPrompt` so it carries the scopes it requires; anything else is dropped at runtime.
 */
export function addMcpDefinitions(nuxt: Nuxt, dir: string) {
  nuxt.hook('mcp:definitions:paths', (paths) => {
    for (const kind of ['tools', 'resources', 'prompts'] as const) {
      const path = join(dir, kind)
      if (existsSync(path) && !paths[kind].includes(path)) paths[kind].push(path)
    }
  })
}
