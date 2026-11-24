// Ships libsql's native binding with the server build.
//
// libsql (the sqlite driver behind `hub.db.driver: 'libsql'`) loads its binding with a computed
// require(`@libsql/${platform}`), which the build's file trace cannot follow, so `node .output/server/index.mjs`
// failed with "Cannot find module '@libsql/<platform>'". This adds every binding that is installed (the one for this
// machine, plus any other platform pnpm's `supportedArchitectures` installs) to the trace, so it lands in `.output`.
// Build on (or install for) the platform the server runs on.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'libsql-binding' },
  setup(_options, nuxt) {
    const fromApp = createRequire(join(nuxt.options.rootDir, 'package.json'))
    let entry: string
    try {
      entry = createRequire(fromApp.resolve('@libsql/client')).resolve('libsql')
    }
    catch {
      return // libsql is not installed: nothing to include
    }
    const pkg = join(dirname(entry), 'package.json')
    if (!existsSync(pkg)) return
    const { optionalDependencies = {} } = JSON.parse(readFileSync(pkg, 'utf8')) as {
      optionalDependencies?: Record<string, string>
    }
    const fromLibsql = createRequire(entry)
    const bindings = Object.keys(optionalDependencies).flatMap((name) => {
      try {
        return [fromLibsql.resolve(name)]
      }
      catch {
        return [] // a binding for another platform, not installed
      }
    })
    if (!bindings.length) return

    nuxt.options.nitro.externals ||= {}
    nuxt.options.nitro.externals.traceInclude = [...(nuxt.options.nitro.externals.traceInclude ?? []), ...bindings]
  },
})
