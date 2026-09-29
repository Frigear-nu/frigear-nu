import { addTemplate, createResolver } from '@nuxt/kit'
import { existsSync } from 'node:fs'
import type { Nuxt } from '@nuxt/schema'

type DbExtenderFn = (props: { dialect: string, paths: string[] }) => void | Promise<void>

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'hub:db:schema:extend': DbExtenderFn
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
  factory: string
  resolver: ReturnType<typeof createResolver>
  schema: (dialect: string) => string
  override?: string
  extensionFile?: (dialect: string) => string
}

export const extendDatabaseTable = (nuxt: Nuxt, options: DatabaseTableOptions) => {
  const { name, factory, resolver, schema, override, extensionFile } = options
  const rootResolver = createResolver(nuxt.options.rootDir)

  return extendDatabaseSchema(nuxt, async ({ dialect, paths }) => {
    if (override && override !== 'default') {
      paths.push(await resolver.resolvePath(override, { cwd: nuxt.options.rootDir }))
      return
    }

    const extensionPath = await rootResolver.resolvePath(extensionFile?.(dialect) ?? `server/db/${name}.extend.${dialect}`)
    const hasExtension = existsSync(extensionPath)
    const template = addTemplate({
      filename: `#${name}/schema.${dialect}.ts`,
      write: true,
      getContents: () => `
import { ${factory} } from ${JSON.stringify(resolver.resolve(schema(dialect)))}
${hasExtension ? `import extra from ${JSON.stringify(extensionPath)}` : 'const extra = {}'}
export const ${name} = ${factory}(extra)
`,
    })
    paths.push(template.dst)
  })
}
