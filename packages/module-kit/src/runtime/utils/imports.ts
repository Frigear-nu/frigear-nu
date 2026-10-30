import { addTypeTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defineVirtualRegistry } from './registry'

export interface OptionalImport {
  /** The auto-import, as `#imports` exports it when its module is installed (`useMenu`, `queryCollection`). */
  name: string
  /** Whether the module that provides it is installed. Called once every module is done, so order does not matter. */
  available: () => boolean
  /** JavaScript for the stand-in when it is not: `undefined`, or a function that throws. */
  fallback: string
  /** The type of the stand-in. */
  fallbackType: string
}

/**
 * Re-exports auto-imports of optional modules from a virtual module of your own (`alias`, e.g. `#menu/optional`), with
 * a stand-in when the module is not installed. App code in a module's runtime imports from `#imports` explicitly (Nuxt
 * does not auto-import into `node_modules`), and importing a name `#imports` does not have fails the build, so names
 * of optional modules are imported from here instead.
 *
 *     addOptionalImports(nuxt, '#account/optional', [{
 *       name: 'useMenu',
 *       available: () => hasNuxtModule('@frigear-nu/menu', nuxt),
 *       fallback: 'undefined',
 *       fallbackType: 'undefined',
 *     }])
 */
export function addOptionalImports(nuxt: Nuxt, alias: string, imports: OptionalImport[]) {
  const base = alias.replace(/^#/, '')
  const line = (available: boolean, { name, fallback }: OptionalImport) =>
    available ? `export { ${name} } from '#imports'` : `export const ${name} = ${fallback}`

  defineVirtualRegistry(nuxt, {
    filename: `${base}.mjs`,
    alias,
    collect: () => imports.map(entry => ({ entry, available: entry.available() })),
    contents: entries => `${entries.map(({ entry, available }) => line(available, entry)).join('\n')}\n`,
  })

  addTypeTemplate({
    filename: `types/${base}.d.ts`,
    getContents: () => `declare module '${alias}' {
${imports.map(entry => entry.available()
  ? `  export { ${entry.name} } from '#imports'`
  : `  export const ${entry.name}: ${entry.fallbackType}`).join('\n')}
}
`,
  })
}
