import { addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'
import { extendDatabaseSchema } from '@frigear-nu/module-kit/utils'
import * as fs from 'node:fs'
import { existsSync } from 'node:fs'

export type ModuleOptions = {
  // When the mode is server, it also registers the
  // oauth stuff so the app can be used to log in with as well as to.
  mode: 'server'
  settings?: {
    migrations?: boolean
    schemas?: {
      users?: 'default' | string // can be any file path to a drizzle schema file, or 'default' to use the default one.
    }
  }
} | {
  // Client means that the application does not have it's own auth,
  // but relies on a central auth server to log in and manage users - e.g frigear.nu
  mode: 'client'
  settings?: {
    // the handler, export default that maps a user from oauth format to object.
    // The default should follow the table structure.
    mapFromHttp?: string
    migrations?: false
  }
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    users?: ModuleOptions
  }
  interface RuntimeConfig {
    users?: ModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/users', configKey: 'users' },
  defaults: { mode: 'server', settings: { migrations: true, schemas: { users: 'default' } } },
  async setup(options, nuxt) {
    const { resolve, resolvePath } = createResolver(import.meta.url)
    const rootResolver = createResolver(nuxt.options.rootDir)

    if (options.mode === 'client') {
      console.log('Users module is running in client mode - will be built accordingly to support oauth.')
    }
    else if (options.mode === 'server') {
      const schemaOpt = options.settings?.schemas?.users ?? 'default'

      nuxt.hook('hub:db:schema:extend', async ({ paths, dialect }) => {
        // Full override: host owns the table entirely
        if (schemaOpt !== 'default') {
          paths.push(await resolvePath(schemaOpt, { cwd: nuxt.options.rootDir }))
          return
        }

        // Default: module table, optionally extended by a host file
        const extendFile = await rootResolver.resolvePath(`server/db/users.extend.${dialect}`)
        const hasExtend = existsSync(extendFile)

        const tpl = addTemplate({
          filename: `#users/schema.${dialect}.ts`,
          write: true, // drizzle-kit needs the file on disk
          getContents: () => `
import { defineUsersTable } from '${resolve(`./db/users.${dialect}`)}'
${hasExtend ? `import extra from '${extendFile}'` : 'const extra = {}'}
export const users = defineUsersTable(extra)
`,
        })
        paths.push(tpl.dst)
      })
    }
  },
})
