import { addTypeTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defineVirtualRegistry } from './registry'

/** An auto-import as Nuxt's import context lists it: `name` exported by `from`, auto-imported as `as` (or `name`). */
type AutoImport = { name: string, as?: string, from: string }

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
  // Each name is re-exported from the file that provides it, not from `#imports`: the build directory is not transformed
  // like app code, so `#imports` there is Nuxt's whole auto-import barrel, and in the client build every auto-import
  // with a side effect (a composable that imports its slideover, MDC's parser) would land in the entry chunk.
  // The list is read from the auto-import context when the template is written, once every module added its entries.
  let importsContext: { getImports: () => Promise<AutoImport[]> } | undefined
  nuxt.hook('imports:context', (context) => {
    importsContext = context
  })
  const line = (available: boolean, { name, fallback }: OptionalImport, autoImports: AutoImport[]) => {
    if (!available) return `export const ${name} = ${fallback}`
    const source = autoImports.find(entry => (entry.as ?? entry.name) === name)
    return source
      ? `export { ${source.name === name ? name : `${source.name} as ${name}`} } from ${JSON.stringify(source.from)}`
      : `export { ${name} } from '#imports'`
  }

  defineVirtualRegistry(nuxt, {
    filename: `${base}.mjs`,
    alias,
    collect: () => imports.map(entry => ({ entry, available: entry.available() })),
    contents: async (entries) => {
      const autoImports = entries.some(({ available }) => available) ? await importsContext?.getImports() ?? [] : []
      return `${entries.map(({ entry, available }) => line(available, entry, autoImports)).join('\n')}\n`
    },
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
