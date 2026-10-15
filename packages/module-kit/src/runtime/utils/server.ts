import { addTemplate, createResolver, useLogger } from '@nuxt/kit'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { kebabCase } from 'scule'
import type { Nuxt } from '@nuxt/schema'
import type { ColumnBuilderBase } from 'drizzle-orm'
import { listRegularTableExportNames, parseRegularTableExport } from './regular-table'

export type DbExtenderFn = (props: { dialect: string, paths: string[] }) => void | Promise<void>
export type TableExtenderFn = (props: { name: string, dialect: string, paths: string[] }) => void | Promise<void>

const LOG_PREFIX = '[@frigear-nu/module-kit]'
/** Extensions a legacy `server/db/<table>.extend.<dialect>` file may have (what `resolvePath` would try). */
const SCRIPT_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']
const warned = new Set<string>()
const warnOnce = (key: string, message: string) => {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`${LOG_PREFIX} ${message}`)
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'hub:db:schema:extend': DbExtenderFn
    'module-kit:db:table:extend': TableExtenderFn
  }
}

/**
 * A typed identity helper for defining a table's extension columns. It exists purely for type
 * inference/clarity when authoring an extension file (`server/db/extend.<dialect>.ts` or a file passed to
 * `extendDatabaseTable`) - it returns the columns object unchanged. A plain `sqliteTable(...)` export works too.
 */
export const defineTableColumns = <T extends Record<string, ColumnBuilderBase>>(
  columns: T,
) => {
  return columns
}

export type TableDefinerProps = { name: string, columns: Record<string, ColumnBuilderBase> }
type TableDefinerFn<T> = (props: TableDefinerProps) => T

/**
 * @deprecated Export plain drizzle tables (e.g. `export const users = sqliteTable('users', { ... })`) and register
 * the file with `registerDatabaseTable` without `factory`.
 *
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
export const onDatabaseSchemaExtend = (
  nuxt: Nuxt,
  extender: DbExtenderFn,
): void => {
  nuxt.hook('hub:db:schema:extend', extender)
}

export type DatabaseTableOptions = {
  /**
   * The name of the table's export (e.g. `users`). Pass an array of names (e.g. `['users', 'userPasskeys']`) to
   * register several tables that are exported from the same `schema` file in one go - they're generated into a
   * single file so that tables can reference each other (e.g. a foreign key `.references(() => users.id)`). An
   * array of names (or omitting `name` entirely) is only supported when `factory` is omitted.
   *
   * Omit it in the common case: every export of `schema` initialised by a table call (`sqliteTable(...)`,
   * `pgTable(...)`) is then registered automatically - this is equivalent to passing an array of every such
   * export's name. Exported non-table objects are ignored. Pass `name` only to restrict which tables are registered
   * (e.g. a feature-dependent subset), or to point at a single export; a `name` that does not point at a table call
   * throws.
   */
  name?: string | string[]
  /**
   * @deprecated Export plain drizzle tables and register the file without `factory`. A one-time warning is logged
   * when it is used.
   *
   * The exported factory function name to call with merged extension columns (e.g. `defineUsersTable`), as produced
   * by `defineExtendableTable`. When omitted, `schema` (and every registered/layer extension file) is treated as a
   * "regular" drizzle file - e.g. `export const users = sqliteTable('users', { ... })` - and its columns are merged
   * directly, without requiring any helper wrapper. Only supported when `name` is a single string, since the
   * factory is called once with a single table's columns.
   */
  factory?: string
  resolver: ReturnType<typeof createResolver>
  /** Path (resolved against `resolver`) of the schema file for a dialect, e.g. `./runtime/db/schema.sqlite`. The file must exist for every dialect the host can use. */
  schema: (dialect: string) => string
  /** Escape hatch: a path (relative to the host root) of a schema file used instead of the generated one. */
  override?: string
  /** Path of the extension file looked up in the host and each layer, instead of `server/db/extend.<dialect>.ts`. Also disables the legacy `<name>.extend.<dialect>` lookup. */
  extensionFile?: (dialect: string) => string
}

export type TableExtensionOptions = {
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
 * Registers a column file to be merged into another module's table whenever its schema is generated (see
 * `registerDatabaseTable`). The file exports the table by its name (`export const users = sqliteTable('users', { ... })`,
 * or a plain columns object) and is merged into every table it has a matching export for; omit `name` unless you
 * need to restrict it. A file that does not exist for the active dialect is skipped. Hooks into
 * `module-kit:db:table:extend`, which `registerDatabaseTable` fires once per table.
 */
export const extendDatabaseTable = (nuxt: Nuxt, options: TableExtensionOptions): void => {
  const names = options.name === undefined ? undefined : (Array.isArray(options.name) ? options.name : [options.name])
  // The hook fires once per table of every registered schema; resolve each dialect's file only the first time.
  const resolved = new Map<string, Promise<string | undefined>>()
  const resolveFile = (dialect: string) => {
    if (!resolved.has(dialect)) {
      resolved.set(dialect, options.resolver.resolvePath(options.file(dialect)).then(file => existsSync(file) ? file : undefined))
    }
    return resolved.get(dialect)!
  }
  nuxt.hook('module-kit:db:table:extend', async ({ name, dialect, paths }) => {
    if (names === undefined || names.includes(name)) {
      const file = await resolveFile(dialect)
      if (file) paths.push(file)
      else if (dialect !== 'sqlite' && await resolveFile('sqlite')) {
        useLogger('module-kit').warn(`No ${dialect} variant of "${options.file('sqlite')}" (table "${name}"): its columns are left out of the ${dialect} schema.`)
      }
    }
  })
}

/**
 * The table-owning module registers its schema with `registerDatabaseTable`. The schema file is a plain drizzle
 * file (`export const users = sqliteTable('users', { ... })`); its table exports are merged with the columns
 * registered through `extendDatabaseTable` and the Nuxt-layer `server/db/extend.<dialect>.ts` files, and written to
 * `.nuxt/module-kit/db/`.
 *
 * Every table export of `schema` is registered unless `name` restricts them. Several tables are generated into a
 * single file, so tables declared in the same `schema` file can reference each other directly (e.g. a foreign key
 * `.references(() => users.id)`), since they share the same module scope.
 *
 * Throws when `schema` has no file for the active dialect (use `override` to point at your own file).
 */
export const registerDatabaseTable = (nuxt: Nuxt, options: DatabaseTableOptions): void => {
  const { name, factory, resolver, schema, override, extensionFile } = options

  if (factory && (name === undefined || Array.isArray(name))) {
    throw new Error(
      '[module-kit] registerDatabaseTable requires a single "name" (not an array, and not omitted) when "factory" is set. '
      + 'Omit "factory" to register multiple (or auto-discovered) tables from the same regular drizzle schema file.',
    )
  }

  if (factory) {
    warnOnce(
      `factory:${factory}`,
      '`factory` / `defineExtendableTable` are deprecated: export plain drizzle tables and register the file without `factory`.',
    )
  }

  onDatabaseSchemaExtend(nuxt, async ({ dialect, paths }) => {
    if (override && override !== 'default') {
      paths.push(await resolver.resolvePath(override, { cwd: nuxt.options.rootDir }))
      return
    }

    const schemaPath = await resolver.resolvePath(schema(dialect))
    if (!existsSync(schemaPath)) {
      throw new Error(
        `${LOG_PREFIX} No ${dialect} schema at "${schema(dialect)}" (resolved to "${schemaPath}"). `
        + `Every module schema must ship a file per dialect, e.g. \`schema.sqlite.ts\` and \`schema.postgresql.ts\`. `
        + `Add the ${dialect} file, or pass the \`override\` option to point at one.`,
      )
    }
    const names = name === undefined ? listRegularTableExportNames(schemaPath, { tablesOnly: true }) : (Array.isArray(name) ? name : [name])

    if (names.length === 0) {
      throw new Error(
        `[module-kit] Could not find any table exports in "${schemaPath}" to register. `
        + `"schema" must be a regular drizzle file, e.g. \`export const users = sqliteTable('users', { ... })\`.`,
      )
    }

    const extensionsByName = new Map<string, Array<{ file: string, legacy: boolean, perTable: boolean }>>()
    for (const tableName of names) {
      const registered: string[] = []
      await nuxt.callHook('module-kit:db:table:extend', { name: tableName, dialect, paths: registered })
      extensionsByName.set(tableName, registered.map(file => ({ file, legacy: true, perTable: false })))
    }

    const layerRoots = [...new Set(nuxt.options._layers?.map(layer => layer.config.rootDir).reverse() ?? [])]
    for (const root of [...layerRoots.filter(root => root !== nuxt.options.rootDir), nuxt.options.rootDir]) {
      // One directory listing per root instead of a `resolvePath` (several `stat`s) per table: this hook runs once
      // per registered schema file at every boot, for every layer.
      const dbDir = join(root, 'server/db')
      const dbFiles = existsSync(dbDir) ? readdirSync(dbDir) : []
      const extensionPath = extensionFile
        ? await createResolver(root).resolvePath(extensionFile(dialect))
        : join(dbDir, `extend.${dialect}.ts`)
      if (!extensionFile) {
        for (const tableName of names) {
          const legacyFile = dbFiles.find(file => SCRIPT_EXTENSIONS.some(ext => file === `${tableName}.extend.${dialect}${ext}`))
          if (legacyFile) extensionsByName.get(tableName)!.push({ file: join(dbDir, legacyFile), legacy: true, perTable: true })
        }
      }
      if (existsSync(extensionPath)) {
        for (const tableName of names) extensionsByName.get(tableName)!.push({ file: extensionPath, legacy: false, perTable: false })
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
      filename: `module-kit/db/${kebabCase(tableName)}.${dialect}.ts`,
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

/** `module-kit/db/<kebab(names)>.<dialect>.ts`, with a short hash appended when the names make it long. */
const templateFilename = (names: string[], dialect: string) => {
  const joined = names.join('-')
  const base = kebabCase(joined)
  const stem = base.length > 80
    ? `${base.slice(0, 60)}-${createHash('sha1').update(joined).digest('hex').slice(0, 8)}`
    : base
  return `module-kit/db/${stem}.${dialect}.ts`
}

const mergeSpecifier = (specifiers: Map<string, string>, specifier: string) => {
  // `X` and `type X` import the same binding: prefer the value import.
  const bare = specifier.replace(/^type\s+/, '')
  const existing = specifiers.get(bare)
  if (existing === undefined || (existing.startsWith('type ') && !specifier.startsWith('type '))) specifiers.set(bare, specifier)
}

const buildRegularTableTemplate = (options: {
  names: string[]
  dialect: string
  schemaPath: string
  extensionsByName: Map<string, Array<{ file: string, legacy: boolean, perTable: boolean }>>
}) => {
  const { names, dialect, schemaPath, extensionsByName } = options

  const importsByModule = new Map<string, Map<string, string>>()
  const addImports = (imports: Map<string, Set<string>>) => {
    for (const [module, specifiers] of imports) {
      const merged = importsByModule.get(module) ?? new Map<string, string>()
      for (const specifier of specifiers) mergeSpecifier(merged, specifier)
      importsByModule.set(module, merged)
    }
  }

  const tables = names.map((name) => {
    const base = parseRegularTableExport(schemaPath, name)
    if (!base) {
      throw new Error(
        `[module-kit] Could not find a table export named "${name}" in "${schemaPath}". `
        + `When "factory" is omitted, "schema" must be a regular drizzle file, e.g. `
        + `\`export const ${name} = sqliteTable(${JSON.stringify(name)}, { ... })\`.`,
      )
    }
    if (!base.tableCall) {
      throw new Error(
        `[module-kit] The export "${name}" in "${schemaPath}" exists but is not a table call. `
        + `When "factory" is omitted, "schema" must be a regular drizzle file, e.g. `
        + `\`export const ${name} = sqliteTable(${JSON.stringify(name)}, { ... })\`.`,
      )
    }

    const properties = new Map(base.properties)
    addImports(base.imports)

    for (const { file, legacy, perTable } of extensionsByName.get(name) ?? []) {
      const parsed = parseRegularTableExport(file, name) ?? (legacy ? parseRegularTableExport(file, 'default') : undefined)
      if (!parsed) {
        if (perTable) {
          warnOnce(`unparsed:${file}:${name}`, `"${file}" is a legacy \`${name}.extend.${dialect}\` file but neither an export named "${name}" nor a default export could be read from it; its columns are left out.`)
        }
        continue
      }

      if (parsed.tableCall?.extraArgs?.length) {
        warnOnce(`indexes:${file}:${name}`, `"${file}" (table "${name}"): the table-config argument (indexes, constraints) of an extension file is ignored. Declare it in the base schema, or add it in a migration.`)
      }
      if (parsed.tableCall && parsed.tableCall.tableName !== base.tableCall.tableName) {
        warnOnce(`table-name:${file}:${name}`, `"${file}" (table "${name}") declares the SQL table "${parsed.tableCall.tableName}" but the base schema declares "${base.tableCall.tableName}"; the base name is used.`)
      }

      for (const [key, value] of parsed.properties) {
        properties.delete(key)
        properties.set(key, value)
      }
      addImports(parsed.imports)
    }

    return { name, tableCall: base.tableCall, properties }
  })

  return addTemplate({
    filename: templateFilename(tables.map(({ name }) => name), dialect),
    write: true,
    getContents: () => `${[...importsByModule].map(([module, specifiers]) => `import { ${[...specifiers.values()].join(', ')} } from ${JSON.stringify(module)}`).join('\n')}
${tables.map(({ name, tableCall, properties }) => `
export const ${name} = ${tableCall.callee}(${JSON.stringify(tableCall.tableName)}, {
${[...properties.values()].map(property => `  ${property},`).join('\n')}
}${tableCall.extraArgs?.length ? `, ${tableCall.extraArgs.join(', ')}` : ''})
`).join('')}`,
  })
}

/**
 * Makes Nitro bundle (instead of externalize) a module's `runtime` directory, and pushes it into `build.transpile`
 * so the app side is transpiled too. Installed modules live in
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
