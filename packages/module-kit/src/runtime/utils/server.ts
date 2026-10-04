import { addTemplate, createResolver } from '@nuxt/kit'
import { existsSync } from 'node:fs'
import type { Nuxt } from '@nuxt/schema'
import type { ColumnBuilderBase } from 'drizzle-orm'
import { parseRegularTableExport } from './regular-table'

type DbExtenderFn = (props: { dialect: string, paths: string[] }) => void | Promise<void>
type TableExtenderFn = (props: { name: string, dialect: string, paths: string[] }) => void | Promise<void>

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'hub:db:schema:extend': DbExtenderFn
    'module-kit:db:table:extend': TableExtenderFn
  }
}

export const defineExtendedColumns = <T extends Record<string, ColumnBuilderBase>>(
  columns: T,
) => {
  return columns
}

type TableDefinerFn = (extras: Record<string, ColumnBuilderBase>) => Record<string, ColumnBuilderBase>

export const defineTable = (table: TableDefinerFn) => {
  return (extras: Record<string, ColumnBuilderBase>) => {
    return table(extras)
  }
}

export const extendDatabaseSchema = async (
  nuxt: Nuxt,
  extender: DbExtenderFn,
) => {
  return nuxt.hook('hub:db:schema:extend', extender)
}

type DatabaseTableOptions = {
  name: string
  /**
   * The exported factory function name to call with merged extension columns (e.g. `defineUsersTable`), as produced
   * by `defineTable`. When omitted, `schema` (and every registered/layer extension file) is treated as a "regular"
   * drizzle file - e.g. `export const users = sqliteTable('users', { ... })` - and its columns are merged directly,
   * without requiring any helper wrapper.
   */
  factory?: string
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

export const registerDatabaseTableExtension = (nuxt: Nuxt, options: TableExtensionOptions) => {
  nuxt.hook('module-kit:db:table:extend', async ({ name, dialect, paths }) => {
    if (name === options.name) {
      const file = await options.resolver.resolvePath(options.file(dialect))
      if (existsSync(file)) paths.push(file)
    }
  })
}

export const extendDatabaseTable = (nuxt: Nuxt, options: DatabaseTableOptions) => {
  const { name, factory, resolver, schema, override, extensionFile } = options

  return extendDatabaseSchema(nuxt, async ({ dialect, paths }) => {
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

    if (!factory) {
      const schemaPath = await resolver.resolvePath(schema(dialect))
      const template = buildRegularTableTemplate({ name, dialect, schemaPath, extensionFiles: extensions.map(({ file }) => file) })
      paths.push(template.dst)
      return
    }

    const template = addTemplate({
      filename: `${name}/schema.${dialect}.ts`,
      write: true,
      getContents: () => `
import { ${factory} } from ${JSON.stringify(resolver.resolve(schema(dialect)))}
${extensions.map(({ file }, index) => `import * as extra${index} from ${JSON.stringify(file)}`).join('\n')}
export const ${name} = ${factory}({ ${extensions.map(({ legacy }, index) => legacy ? `...(extra${index}[${JSON.stringify(name)} as keyof typeof extra${index}] ?? Object.entries(extra${index}).find(([key]) => key === 'default')?.[1] ?? {})` : `...(extra${index}[${JSON.stringify(name)} as keyof typeof extra${index}] ?? {})`).join(', ')} })
`,
    })
    paths.push(template.dst)
  })
}

const buildRegularTableTemplate = (options: { name: string, dialect: string, schemaPath: string, extensionFiles: string[] }) => {
  const { name, dialect, schemaPath, extensionFiles } = options

  const base = parseRegularTableExport(schemaPath, name)
  if (!base?.tableCall) {
    throw new Error(
      `[module-kit] Could not find a table export named "${name}" in "${schemaPath}". `
      + `When "factory" is omitted, "schema" must be a regular drizzle file, e.g. `
      + `\`export const ${name} = sqliteTable(${JSON.stringify(name)}, { ... })\`.`,
    )
  }

  const properties = new Map(base.properties)
  const importsByModule = new Map([...base.imports].map(([module, specifiers]) => [module, new Set(specifiers)]))

  for (const file of extensionFiles) {
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

  return addTemplate({
    filename: `${name}/schema.${dialect}.ts`,
    write: true,
    getContents: () => `
${[...importsByModule].map(([module, specifiers]) => `import { ${[...specifiers].join(', ')} } from ${JSON.stringify(module)}`).join('\n')}
export const ${name} = ${base.tableCall!.callee}(${JSON.stringify(base.tableCall!.tableName)}, {
${[...properties.values()].map(property => `  ${property},`).join('\n')}
})
`,
  })
}
