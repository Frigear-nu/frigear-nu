import { addTemplate, createResolver, useLogger } from '@nuxt/kit'
import { existsSync } from 'node:fs'
import type { Nuxt } from '@nuxt/schema'
import type { ColumnBuilderBase } from 'drizzle-orm'
import { listRegularTableExportNames, parseRegularTableExport } from './regular-table'

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
  /**
   * The name of the table's export (e.g. `users`). Pass an array of names (e.g. `['users', 'userPasskeys']`) to
   * register several tables that are exported from the same `schema` file in one go - they're generated into a
   * single file so that tables can reference each other (e.g. a foreign key `.references(() => users.id)`). An
   * array of names (or omitting `name` entirely) is only supported when `factory` is omitted.
   *
   * When omitted, every table-like export in `schema` (and its extension files) is registered automatically - this
   * is equivalent to passing an array of every such export's name.
   */
  name?: string | string[]
  /**
   * The exported factory function name to call with merged extension columns (e.g. `defineUsersTable`), as produced
   * by `defineExtendableTable`. When omitted, `schema` (and every registered/layer extension file) is treated as a
   * "regular" drizzle file - e.g. `export const users = sqliteTable('users', { ... })` - and its columns are merged
   * directly, without requiring any helper wrapper. Only supported when `name` is a single string, since the
   * factory is called once with a single table's columns.
   */
  factory?: string
  resolver: ReturnType<typeof createResolver>
  schema: (dialect: string) => string
  override?: string
  extensionFile?: (dialect: string) => string
}

type TableExtensionOptions = {
  /**
   * The name of the table to extend (e.g. `users`). Pass an array of names (e.g. `['users', 'userPasskeys']`) when
   * `file` exports columns for several tables at once - it's resolved and parsed once per matching table, same as
   * if `extendDatabaseTable` had been called separately for each name with the same `file`.
   *
   * When omitted, `file` is registered against every table - whichever table(s) it actually has a matching export
   * for (parsed the same way as the shared Nuxt-layer `server/db/extend.<dialect>.ts` files) pick up its columns;
   * tables it has no matching export for are unaffected.
   */
  name?: string | string[]
  resolver: ReturnType<typeof createResolver>
  file: (dialect: string) => string
}

/**
 * Registers a column file to be merged into a named table whenever its schema is generated (see
 * `registerDatabaseTable`). Fires the `module-kit:db:table:extend` hook internally, which
 * `registerDatabaseTable` listens to.
 */
export const extendDatabaseTable = (nuxt: Nuxt, options: TableExtensionOptions) => {
  const names = options.name === undefined ? undefined : (Array.isArray(options.name) ? options.name : [options.name])
  nuxt.hook('module-kit:db:table:extend', async ({ name, dialect, paths }) => {
    if (names === undefined || names.includes(name)) {
      const file = await options.resolver.resolvePath(options.file(dialect))
      if (existsSync(file)) paths.push(file)
      else if (dialect !== 'sqlite' && existsSync(await options.resolver.resolvePath(options.file('sqlite')))) {
        useLogger('module-kit').warn(`No ${dialect} variant of "${options.file('sqlite')}" (table "${name}"): its columns are left out of the ${dialect} schema.`)
      }
    }
  })
}

/**
 * The table-owning module registers its schema with `registerDatabaseTable`. It generates the
 * table by importing the named `factory` from `schema`, merging in any columns registered
 * through `extendDatabaseTable` and any Nuxt-layer extension files, then calling the factory with
 * `{ name, columns }`.
 *
 * When `name` is an array, or omitted entirely, every (named or auto-discovered) table is generated into a single
 * file - this lets tables declared in the same `schema` file reference each other directly (e.g. a foreign key
 * `.references(() => users.id)` from a `userPasskeys` table), since they share the same module scope.
 */
export const registerDatabaseTable = (nuxt: Nuxt, options: DatabaseTableOptions) => {
  const { name, factory, resolver, schema, override, extensionFile } = options

  if (factory && (name === undefined || Array.isArray(name))) {
    throw new Error(
      '[module-kit] registerDatabaseTable requires a single "name" (not an array, and not omitted) when "factory" is set. '
      + 'Omit "factory" to register multiple (or auto-discovered) tables from the same regular drizzle schema file.',
    )
  }

  return onDatabaseSchemaExtend(nuxt, async ({ dialect, paths }) => {
    if (override && override !== 'default') {
      paths.push(await resolver.resolvePath(override, { cwd: nuxt.options.rootDir }))
      return
    }

    const schemaPath = await resolver.resolvePath(schema(dialect))
    // Only for a missing dialect variant: a schema file that exists for no dialect is the generated template's problem.
    if (dialect !== 'sqlite' && !existsSync(schemaPath) && existsSync(await resolver.resolvePath(schema('sqlite')))) {
      throw new Error(
        `[module-kit] No ${dialect} schema at "${schema(dialect)}" (resolved to "${schemaPath}"). `
        + `Every module schema must ship a file per dialect, e.g. \`schema.sqlite.ts\` and \`schema.postgresql.ts\`.`,
      )
    }
    const names = name === undefined ? listRegularTableExportNames(schemaPath) : (Array.isArray(name) ? name : [name])

    if (names.length === 0) {
      throw new Error(
        `[module-kit] Could not find any table exports in "${schemaPath}" to register. `
        + `"schema" must be a regular drizzle file, e.g. \`export const users = sqliteTable('users', { ... })\`.`,
      )
    }

    const extensionsByName = new Map<string, Array<{ file: string, legacy: boolean }>>()
    for (const tableName of names) {
      const registered: string[] = []
      await nuxt.callHook('module-kit:db:table:extend', { name: tableName, dialect, paths: registered })
      extensionsByName.set(tableName, registered.map(file => ({ file, legacy: true })))
    }

    const layerRoots = [...new Set(nuxt.options._layers?.map(layer => layer.config.rootDir).reverse() ?? [])]
    for (const root of [...layerRoots.filter(root => root !== nuxt.options.rootDir), nuxt.options.rootDir]) {
      const rootResolver = createResolver(root)
      const extensionPath = await rootResolver.resolvePath(extensionFile?.(dialect) ?? `server/db/extend.${dialect}.ts`)
      if (!extensionFile) {
        for (const tableName of names) {
          const legacyPath = await rootResolver.resolvePath(`server/db/${tableName}.extend.${dialect}`)
          if (existsSync(legacyPath)) extensionsByName.get(tableName)!.push({ file: legacyPath, legacy: true })
        }
      }
      if (existsSync(extensionPath)) {
        for (const tableName of names) extensionsByName.get(tableName)!.push({ file: extensionPath, legacy: false })
      }
    }

    if (!factory) {
      const template = buildRegularTableTemplate({ names, dialect, schemaPath, extensionsByName })
      paths.push(template.dst)
      return
    }

    const tableName = names[0]!
    const extensions = extensionsByName.get(tableName)!
    const template = addTemplate({
      filename: `${tableName}/schema.${dialect}.ts`,
      write: true,
      getContents: () => `
import { ${factory} } from ${JSON.stringify(resolver.resolve(schema(dialect)))}
${extensions.map(({ file }, index) => `import * as extra${index} from ${JSON.stringify(file)}`).join('\n')}
export const ${tableName} = ${factory}({ name: ${JSON.stringify(tableName)}, columns: { ${extensions.map(({ legacy }, index) => legacy ? `...(extra${index}[${JSON.stringify(tableName)} as keyof typeof extra${index}] ?? Object.entries(extra${index}).find(([key]) => key === 'default')?.[1] ?? {})` : `...(extra${index}[${JSON.stringify(tableName)} as keyof typeof extra${index}] ?? {})`).join(', ')} } })
`,
    })
    paths.push(template.dst)
  })
}

const buildRegularTableTemplate = (options: {
  names: string[]
  dialect: string
  schemaPath: string
  extensionsByName: Map<string, Array<{ file: string, legacy: boolean }>>
}) => {
  const { names, dialect, schemaPath, extensionsByName } = options

  const importsByModule = new Map<string, Set<string>>()
  const tables = names.map((name) => {
    const base = parseRegularTableExport(schemaPath, name)
    if (!base?.tableCall) {
      throw new Error(
        `[module-kit] Could not find a table export named "${name}" in "${schemaPath}". `
        + `When "factory" is omitted, "schema" must be a regular drizzle file, e.g. `
        + `\`export const ${name} = sqliteTable(${JSON.stringify(name)}, { ... })\`.`,
      )
    }

    const properties = new Map(base.properties)
    for (const [module, specifiers] of base.imports) {
      const set = importsByModule.get(module) ?? new Set<string>()
      for (const specifier of specifiers) set.add(specifier)
      importsByModule.set(module, set)
    }

    for (const { file } of extensionsByName.get(name) ?? []) {
      const parsed = parseRegularTableExport(file, name)
      if (!parsed) continue

      for (const [key, value] of parsed.properties) {
        properties.delete(key)
        properties.set(key, value)
      }
      for (const [module, specifiers] of parsed.imports) {
        const set = importsByModule.get(module) ?? new Set<string>()
        for (const specifier of specifiers) set.add(specifier)
        importsByModule.set(module, set)
      }
    }

    return { name, tableCall: base.tableCall, properties }
  })

  return addTemplate({
    filename: `users/${tables.map(({ name }) => name)?.join('-')?.toLowerCase() || crypto.randomUUID()}.schema.${dialect}.ts`,
    write: true,
    getContents: () => `${[...importsByModule].map(([module, specifiers]) => `import { ${[...specifiers].join(', ')} } from ${JSON.stringify(module)}`).join('\n')}
${tables.map(({ name, tableCall, properties }) => `
export const ${name} = ${tableCall.callee}(${JSON.stringify(tableCall.tableName)}, {
${[...properties.values()].map(property => `  ${property},`).join('\n')}
}${tableCall.extraArgs?.length ? `, ${tableCall.extraArgs.join(', ')}` : ''})
`).join('')}`,
  })
}

/**
 * Makes Nitro bundle (instead of externalize) a module's `runtime` directory. Installed modules live in
 * `node_modules`, which Nitro externalizes by default; that skips the auto-import transform for the module's
 * server utils and leaves virtual modules such as `#auth/*` unresolved in consuming apps. Call it next to
 * `addServerImportsDir` so the module works without the host configuring `nitro.externals.inline` itself.
 */
export const inlineModuleRuntime = (nuxt: Nuxt, resolver: ReturnType<typeof createResolver>) => {
  const runtime = resolver.resolve('./runtime')
  nuxt.options.build.transpile.push(runtime)
  nuxt.hook('nitro:config', (config) => {
    config.externals ||= {}
    config.externals.inline ||= []
    if (!config.externals.inline.includes(runtime)) config.externals.inline.push(runtime)
  })
}
