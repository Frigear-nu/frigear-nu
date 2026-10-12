import { addServerImportsDir, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { ModuleOptions } from './types'

export type { ModuleOptions } from './types'
export { addMcpDefinitions } from './runtime/utils/build'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    mcpModules?: ModuleOptions
  }
}

const DEFAULT_INSTRUCTIONS = [
  'You act as the signed-in user, limited to the scopes of the API token in use. You only see the tools that token and the user are allowed to use.',
  'Personal data of other people (names, emails, form answers) is withheld unless the token carries the matching "*:pii" scope. Responses say when something was withheld; report that to the user instead of looking for another way to get it.',
  'Some settings are deliberately not available here, for example where form submissions are delivered, because changing them could be used to exfiltrate data. When a tool refuses for that reason, tell the user to make the change in the admin UI.',
].join('\n')

export default defineNuxtModule<ModuleOptions>({
  // Not `mcp`: that key belongs to @nuxtjs/mcp-toolkit.
  meta: { name: '@frigear-nu/mcp', configKey: 'mcpModules' },
  defaults: {},
  moduleDependencies: {
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@nuxtjs/mcp-toolkit': {
      version: '>=0.24.0',
      defaults: {},
    },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // `useEvent()` inside tool handlers is how the scoped definers reach the request.
    nuxt.options.nitro.experimental = { ...nuxt.options.nitro.experimental, asyncContext: true }

    // Standing instructions the client puts in the agent's context, so limits are explained up front.
    const host = nuxt.options as typeof nuxt.options & { mcp?: { route?: string, instructions?: string } }
    host.mcp = {
      ...host.mcp,
      ...(options.route ? { route: options.route } : {}),
      instructions: host.mcp?.instructions ?? DEFAULT_INSTRUCTIONS,
    }

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/mcp'))
  },
})
