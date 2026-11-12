import { isAbsolute, resolve } from 'node:path'
import { addTypeTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defineVirtualRegistry } from './registry'

export interface BootstrapProvider {
  /**
   * The area the data belongs to, e.g. `account`. The area's owner loads every provider of its scope in one request
   * (`GET /api/auth/bootstrap?scope=<scope>`) when the visitor enters it.
   */
  scope: string
  /**
   * The response key, and the `useCachedFetch` key the module's own composable reads the same data with: the area
   * primes that cache entry, so the composable renders it without a request of its own.
   */
  key: string
  /**
   * Server file whose default export is `(event: H3Event) => Promise<data>`, absolute (`resolver.resolve(...)`) or
   * relative to the app's `rootDir`. It returns exactly what the module's own endpoint for `key` returns.
   */
  handler: string
}

declare module '@nuxt/schema' {
  interface NuxtOptions {
    /** Bootstrap providers registered through `registerBootstrapProvider`, in registration order. */
    _bootstrapProviders?: BootstrapProvider[]
  }
}

const NAME = /^[\w.:-]+$/

/**
 * Contribute a piece of the signed-in user's data to an area's bootstrap request, so the area loads it together with
 * every other module's in one call instead of one call per module. Call it from your module's `setup()`:
 *
 * ```ts
 * registerBootstrapProvider(nuxt, {
 *   scope: 'account',
 *   key: 'events:tickets:mine', // the key `useMyTickets()` passes to `useCachedFetch`
 *   handler: resolver.resolve('./runtime/server/bootstrap/my-tickets'),
 * })
 * ```
 *
 * The handler runs on the bootstrap request's event after the caller is authenticated; check the permission there as your
 * route does (`authorize(event, 'tickets:read')`). A handler that throws is left out of the response and the
 * composable fetches the data from your endpoint instead.
 */
export function registerBootstrapProvider(nuxt: Nuxt, provider: BootstrapProvider): void {
  for (const field of ['scope', 'key'] as const) {
    if (!NAME.test(provider[field] ?? '')) {
      throw new Error(`[@frigear-nu/module-kit] registerBootstrapProvider: invalid ${field} ${JSON.stringify(provider[field])} (letters, digits, \`_ . : -\`).`)
    }
  }
  if (!provider.handler) throw new Error(`[@frigear-nu/module-kit] registerBootstrapProvider: "${provider.key}" has no handler.`)

  const providers = nuxt.options._bootstrapProviders ||= []
  if (providers.some(entry => entry.scope === provider.scope && entry.key === provider.key)) {
    throw new Error(`[@frigear-nu/module-kit] registerBootstrapProvider: "${provider.key}" is already registered for the "${provider.scope}" scope.`)
  }
  const handler = isAbsolute(provider.handler) ? provider.handler : resolve(nuxt.options.rootDir, provider.handler)
  providers.push({ scope: provider.scope, key: provider.key, handler })
}

/** The registered bootstrap providers, optionally of one scope. */
export function getBootstrapProviders(nuxt: Nuxt, scope?: string): BootstrapProvider[] {
  const providers = nuxt.options._bootstrapProviders ?? []
  return scope === undefined ? [...providers] : providers.filter(provider => provider.scope === scope)
}

/** Source of `#bootstrap/providers`: `providers[scope]` is the list of `{ key, handler }` of that scope. */
export function bootstrapProvidersTemplate(providers: BootstrapProvider[]): string {
  const scopes = new Map<string, string[]>()
  providers.forEach((provider, index) => {
    const entries = scopes.get(provider.scope) ?? []
    entries.push(`{ key: ${JSON.stringify(provider.key)}, handler: provider${index} }`)
    scopes.set(provider.scope, entries)
  })
  return [
    ...providers.map((provider, index) => `import provider${index} from ${JSON.stringify(provider.handler)}`),
    `export const providers = {${[...scopes].map(([scope, entries]) => `\n  ${JSON.stringify(scope)}: [${entries.join(', ')}],`).join('')}\n}`,
    '',
  ].join('\n')
}

/**
 * Bundles every registered bootstrap provider into the server virtual module `#bootstrap/providers` once all modules
 * are done. Called by the module that serves the bootstrap route (`@frigear-nu/auth`); module authors use
 * `registerBootstrapProvider`.
 */
export function defineBootstrapRegistry(nuxt: Nuxt): void {
  defineVirtualRegistry(nuxt, {
    filename: '#bootstrap/providers',
    target: 'server',
    collect: () => getBootstrapProviders(nuxt),
    contents: bootstrapProvidersTemplate,
  })

  addTypeTemplate({
    filename: 'types/bootstrap-providers.d.ts',
    getContents: () => `declare module '#bootstrap/providers' {
  export const providers: Record<string, Array<{ key: string, handler: (event: import('h3').H3Event) => unknown }>>
}
export {}
`,
  }, { nitro: true, nuxt: true })
}
