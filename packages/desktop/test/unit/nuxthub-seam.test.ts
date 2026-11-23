import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCheckedNuxtHubVersion, NUXTHUB_SEAM } from '../../src/build'
import { HUB_MIGRATIONS_TABLE } from '../../src/runtime/shared/local-db'

// Local mode replaces NuxtHub's generated database client and does NuxtHub's production migrations itself. These checks
// fail loudly when the installed @nuxthub/core changes what that relies on: update `NUXTHUB_SEAM`, `localDbTemplate`
// and `applyMigrations` with it, and test a local-mode build end to end.

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('@nuxthub/core/package.json'))
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version
const source = (path: string) => readFileSync(join(root, 'dist', path), 'utf8')
const moduleSource = source('module.mjs')

describe('NuxtHub seam', () => {
  it('is a version the seam was checked against', () => {
    expect(isCheckedNuxtHubVersion(version), `@nuxthub/core ${version}`).toBe(true)
    expect(isCheckedNuxtHubVersion('0.11.0')).toBe(false)
    expect(isCheckedNuxtHubVersion(undefined)).toBe(false)
  })

  it('writes its client as the @nuxthub/db package in the app\'s node_modules, with the schema next to it', () => {
    expect(moduleSource).toContain('join(nuxt.options.rootDir, "node_modules", "@nuxthub", "db")')
    expect(NUXTHUB_SEAM.schemaFile).toEqual(['node_modules', '@nuxthub', 'db', 'schema.mjs'])
    expect(moduleSource).toContain('copyFile(join(nuxt.options.buildDir, "hub/db/schema.mjs"), join(physicalDbDir, "schema.mjs"))')
    expect(moduleSource).toContain('"./schema": { types: "./schema.d.mts", default: "./schema.mjs" }')
  })

  it('imports it as `@nuxthub/db`, with `hub:db` and `hub:db:schema` as aliases', () => {
    expect(moduleSource).toContain(`nuxt.options.alias["${NUXTHUB_SEAM.dbAlias}"] = "${NUXTHUB_SEAM.dbPackage}"`)
    expect(moduleSource).toContain(`nuxt.options.alias["${NUXTHUB_SEAM.schemaAlias}"] = "${NUXTHUB_SEAM.schemaSpecifier}"`)
    expect(moduleSource).toContain(`addServerImports({ name: "db", from: "${NUXTHUB_SEAM.dbPackage}"`)
    expect(moduleSource).toContain(`addServerImports({ name: "schema", from: "${NUXTHUB_SEAM.dbPackage}"`)
  })

  it('migrates in production only at build time, controlled by `applyMigrationsDuringBuild` on runtimeConfig.hub', () => {
    expect(source('db/runtime/plugins/migrations.dev.mjs')).toMatch(/if \(!import\.meta\.dev\) return/)
    expect(source('db/lib/build.mjs')).toContain('if (!hub.db || !hub.db.applyMigrationsDuringBuild) return;')
    expect(moduleSource).toContain('await applyBuildTimeMigrations(nitro, hub);')
    expect(moduleSource).toContain('runtimeConfig.hub = hub;')
  })

  it('collects every migrations dir into `<hub.dir>/db/migrations` and records applied ones in `_hub_migrations`', () => {
    const storage = source('db/lib/storage.mjs')
    expect(storage).toContain(`base: join(hub.dir, "${NUXTHUB_SEAM.migrationsDir.join('/')}")`)
    expect(source('db/lib/utils.mjs')).toContain(`export const CreateDatabaseMigrationsTableQuerySqlite = \`${HUB_MIGRATIONS_TABLE}\`;`)
    expect(source('db/lib/migrations.mjs')).toContain('INSERT INTO _hub_migrations (name) values (\'${migration.name}\');')
  })

  it('backs `hub.kv: true` with fs-lite under the relative `.data/kv` (the data folder, once the server chdirs there)', () => {
    expect(moduleSource).toMatch(/return defu\(hub\.kv, \{\s+driver: "fs-lite",\s+base: "\.data\/kv"\s+\}\);/)
  })
})
