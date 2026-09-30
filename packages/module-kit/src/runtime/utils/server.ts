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

export const defineExtendedColumns = <T extends Record<string, ColumnBuilderBase>>(
  table: string,
  columns: T,
) => {
  return columns
}

export const extendDatabaseSchema = async (
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

    const extensions: string[] = []
    await nuxt.callHook('module-kit:db:table:extend', { name, dialect, paths: extensions })

    const layerRoots = [...new Set(nuxt.options._layers?.map(layer => layer.config.rootDir).reverse() ?? [])]
    for (const root of [...layerRoots.filter(root => root !== nuxt.options.rootDir), nuxt.options.rootDir]) {
      const extensionPath = await createResolver(root).resolvePath(extensionFile?.(dialect) ?? `server/db/${name}.extend.${dialect}`)
      if (existsSync(extensionPath)) extensions.push(extensionPath)
    }

    const template = addTemplate({
      filename: `${name}/schema.${dialect}.ts`,
      write: true,
      getContents: () => `
import { ${factory} } from ${JSON.stringify(resolver.resolve(schema(dialect)))}
${extensions.map((file, index) => `import extra${index} from ${JSON.stringify(file)}`).join('\n')}
export const ${name} = ${factory}({ ${extensions.map((_, index) => `...extra${index}`).join(', ')} })
`,
    })
    paths.push(template.dst)
  })
}
