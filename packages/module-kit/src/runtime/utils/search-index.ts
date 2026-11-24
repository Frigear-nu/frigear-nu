import { isAbsolute, resolve } from 'node:path'
import { addTypeTemplate, createResolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defineVirtualRegistry } from './registry'
import { bundleServerDependencies } from './server'

export interface SearchIndexRegistration {
  /** A unique name for the log and the task result, usually the table (`users`, `help_articles`). */
  name: string
  /**
   * Server file whose default export is a `defineSearchIndex({ table, columns })` (`@frigear-nu/module-kit/server`),
   * absolute (`resolver.resolve(...)`) or relative to the app's `rootDir`.
   */
  handler: string
}

declare module '@nuxt/schema' {
  interface NuxtOptions {
    /** Search indexes registered through `registerSearchIndex`, in registration order. */
    _searchIndexes?: SearchIndexRegistration[]
  }
}

const NAME = /^[\w.:-]+$/
const TASK = 'search:reindex'

/** Source of `#search-indexes`: `indexes` is the list of `{ name, index }` in registration order. */
export function searchIndexesTemplate(registrations: SearchIndexRegistration[]): string {
  return [
    ...registrations.map((registration, index) => `import index${index} from ${JSON.stringify(registration.handler)}`),
    `export const indexes = [${registrations.map((registration, index) => `\n  { name: ${JSON.stringify(registration.name)}, index: index${index} },`).join('')}\n]`,
    '',
  ].join('\n')
}

/** The registered search indexes. */
export function getSearchIndexes(nuxt: Nuxt): SearchIndexRegistration[] {
  return [...nuxt.options._searchIndexes ?? []]
}

/**
 * Registers a table's normalised search columns (see `searchText`) with the `search:reindex` Nitro task, which
 * recomputes them for every row and rewrites the rows whose value differs. Run it after changing how a column is
 * computed, or once after a migration that backfilled the column in SQL (sqlite's `lower()` folds ASCII only). Call
 * it from your module's `setup()`:
 *
 * ```ts
 * registerSearchIndex(nuxt, { name: 'operations', handler: resolver.resolve('./runtime/server/search-index') })
 * ```
 *
 * The first call adds the task (and turns on Nitro's `experimental.tasks`).
 */
export function registerSearchIndex(nuxt: Nuxt, registration: SearchIndexRegistration): void {
  if (!NAME.test(registration.name ?? '')) {
    throw new Error(`[@frigear-nu/module-kit] registerSearchIndex: invalid name ${JSON.stringify(registration.name)} (letters, digits, \`_ . : -\`).`)
  }
  if (!registration.handler) throw new Error(`[@frigear-nu/module-kit] registerSearchIndex: "${registration.name}" has no handler.`)

  const first = !nuxt.options._searchIndexes
  const registrations = nuxt.options._searchIndexes ||= []
  if (registrations.some(entry => entry.name === registration.name)) {
    throw new Error(`[@frigear-nu/module-kit] registerSearchIndex: "${registration.name}" is already registered.`)
  }
  const handler = isAbsolute(registration.handler) ? registration.handler : resolve(nuxt.options.rootDir, registration.handler)
  registrations.push({ name: registration.name, handler })

  if (first) defineSearchIndexRegistry(nuxt)
}

function defineSearchIndexRegistry(nuxt: Nuxt): void {
  const resolver = createResolver(import.meta.url)
  const runtime = resolver.resolve('..')

  defineVirtualRegistry(nuxt, {
    filename: '#search-indexes',
    target: 'server',
    collect: () => getSearchIndexes(nuxt),
    contents: searchIndexesTemplate,
  })

  addTypeTemplate({
    filename: 'types/search-indexes.d.ts',
    getContents: () => `declare module '#search-indexes' {
  export const indexes: Array<{ name: string, index: import('@frigear-nu/module-kit/server').SearchIndexDefinition }>
}
export {}
`,
  }, { nitro: true, nuxt: true })

  nuxt.hook('nitro:config', (config) => {
    config.experimental ||= {}
    config.experimental.tasks = true
    config.tasks ||= {}
    config.tasks[TASK] = {
      handler: resolver.resolve('../server/tasks/search-reindex'),
      description: 'Recompute the normalised search columns of every registered table.',
    }
    // The task lives in module-kit's runtime, which is bundled (not externalised) like every module's.
    bundleServerDependencies(nuxt, config, [runtime])
  })
}
