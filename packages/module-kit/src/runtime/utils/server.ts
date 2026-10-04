import { addTemplate, createResolver } from '@nuxt/kit'
import { existsSync } from 'node:fs'
import type { Nuxt } from '@nuxt/schema'
import type { ColumnBuilderBase } from 'drizzle-orm'

type DbExtenderFn = (props: { dialect: string, paths: string[] }) => void | Promise<void>
type TableExtenderFn = (props: { name: string, dialect: string, paths: string[] }) => void | Promise<void>

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'hub:db:schema:extend': DbExtenderFn
    'module-kit:db:table:extend': TableExtenderFn
  }
}

/**
 * A typed identity helper for defining a table's extension columns. It exists purely for type
 * inference/clarity when authoring `server/db/extend.<dialect>.ts` files — it returns the columns
 * object unchanged.
 */
export const defineTableColumns = <T extends Record<string, ColumnBuilderBase>>(
  columns: T,
) => {
  return columns
}

type TableDefinerProps = { name: string, columns: Record<string, ColumnBuilderBase> }
type TableDefinerFn<T> = (props: TableDefinerProps) => T

/**
 * Wraps a Drizzle table factory so it receives `{ name, columns }`, letting the factory pass
 * `name` straight through to e.g. `sqliteTable(name, columns)` instead of hard-coding it, so the
 * table name only has to be maintained once, in the `registerDatabaseTable` call.
 */
export const defineExtendableTable = <T>(table: TableDefinerFn<T>) => {
  return (props: TableDefinerProps): T => {
    return table(props)
  }
}

/**
 * Lower-level primitive behind `registerDatabaseTable`. Registers a callback on the
 * `hub:db:schema:extend` hook, which receives the current `dialect` and the `paths` array of
 * schema files to include in the generated database schema. Most modules should use
 * `registerDatabaseTable` instead, unless they need full control over how their schema file is
 * built.
 */
export const onDatabaseSchemaExtend = async (
  nuxt: Nuxt,
  extender: DbExtenderFn,
) => {
  return nuxt.hook('hub:db:schema:extend', extender)
}

type DatabaseTableOptions = {
  name: string
  factory: string
  resolver: ReturnType<typeof createResolver>
  schema: (dialect: string) => string
  override?: string
  extensionFile?: (dialect: string) => string
}

type TableExtensionOptions = {
  name: string
  resolver: ReturnType<typeof createResolver>
  file: (dialect: string) => string
}

/**
 * Registers a column file to be merged into a named table whenever its schema is generated (see
 * `registerDatabaseTable`). Fires the `module-kit:db:table:extend` hook internally, which
 * `registerDatabaseTable` listens to.
 */
export const extendDatabaseTable = (nuxt: Nuxt, options: TableExtensionOptions) => {
  nuxt.hook('module-kit:db:table:extend', async ({ name, dialect, paths }) => {
    if (name === options.name) {
      const file = await options.resolver.resolvePath(options.file(dialect))
      if (existsSync(file)) paths.push(file)
    }
  })
}

/**
 * The table-owning module registers its schema with `registerDatabaseTable`. It generates the
 * table by importing the named `factory` from `schema`, merging in any columns registered
 * through `extendDatabaseTable` and any Nuxt-layer extension files, then calling the factory with
 * `{ name, columns }`.
 */
export const registerDatabaseTable = (nuxt: Nuxt, options: DatabaseTableOptions) => {
  const { name, factory, resolver, schema, override, extensionFile } = options

  return onDatabaseSchemaExtend(nuxt, async ({ dialect, paths }) => {
    if (override && override !== 'default') {
      paths.push(await resolver.resolvePath(override, { cwd: nuxt.options.rootDir }))
      return
    }

    const registered: string[] = []
    await nuxt.callHook('module-kit:db:table:extend', { name, dialect, paths: registered })
    const extensions = registered.map(file => ({ file, legacy: true }))

    const layerRoots = [...new Set(nuxt.options._layers?.map(layer => layer.config.rootDir).reverse() ?? [])]
    for (const root of [...layerRoots.filter(root => root !== nuxt.options.rootDir), nuxt.options.rootDir]) {
      const rootResolver = createResolver(root)
      const extensionPath = await rootResolver.resolvePath(extensionFile?.(dialect) ?? `server/db/extend.${dialect}.ts`)
      if (!extensionFile) {
        const legacyPath = await rootResolver.resolvePath(`server/db/${name}.extend.${dialect}`)
        if (existsSync(legacyPath)) extensions.push({ file: legacyPath, legacy: true })
      }
      if (existsSync(extensionPath)) extensions.push({ file: extensionPath, legacy: false })
    }

    const template = addTemplate({
      filename: `${name}/schema.${dialect}.ts`,
      write: true,
      getContents: () => `
import { ${factory} } from ${JSON.stringify(resolver.resolve(schema(dialect)))}
${extensions.map(({ file }, index) => `import * as extra${index} from ${JSON.stringify(file)}`).join('\n')}
export const ${name} = ${factory}({ name: ${JSON.stringify(name)}, columns: { ${extensions.map(({ legacy }, index) => legacy ? `...(extra${index}[${JSON.stringify(name)} as keyof typeof extra${index}] ?? Object.entries(extra${index}).find(([key]) => key === 'default')?.[1] ?? {})` : `...(extra${index}[${JSON.stringify(name)} as keyof typeof extra${index}] ?? {})`).join(', ')} } })
`,
    })
    paths.push(template.dst)
  })
}
