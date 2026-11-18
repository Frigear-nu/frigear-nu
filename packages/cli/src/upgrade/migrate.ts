import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseModule } from 'magicast'
import { getDefaultExportOptions } from 'magicast/helpers'
import { isBetween } from './versions.ts'

export const DOCS = 'https://docs.frigear.dev'

/** A pattern looked for in the workspace's source files. */
export interface Rule {
  /** Must be global (`/…/g`). */
  pattern: RegExp
  /** What to do about a match (for a `replace` rule: what changed and what to check). */
  message: string
  /** Rewrites each match (`String.prototype.replace` semantics); without it the match is only listed. */
  replace?: string
  /** Only files whose path matches. */
  files?: RegExp
  /** Only files whose text matches. */
  when?: RegExp
  /** Not in files whose text matches (already migrated). */
  unless?: RegExp
}

/** What a workspace-level check found: changes it made and things a person must do. */
export interface ProjectResult {
  applied?: string[]
  manual?: string[]
}

export interface ProjectContext {
  root: string
  /** Source files (absolute), including every `nuxt.config.*`. */
  files: string[]
  dryRun: boolean
}

/** One breaking change of one release, and what the upgrade does about it. */
export interface Migration {
  id: string
  /** `@frigear-nu/<name>` */
  package: string
  /** The first version with the change: the migration runs when upgrading across it. */
  since: string
  title: string
  /** Docs page that explains the change. */
  docs: string
  rules?: Rule[]
  /** Checks or changes that need the whole workspace (nuxt.config options, env files). */
  project?: (ctx: ProjectContext) => Promise<ProjectResult>
  /** One-off steps a person takes after the upgrade (ops, data checks). */
  steps?: string[]
  /** The release changed a database schema: the app needs a new migration. */
  schema?: boolean
}

export interface Hit {
  file: string
  line: number
  text: string
  message: string
}

export interface MigrationResult {
  migration: Migration
  applied: Hit[]
  manual: Hit[]
  project: Required<ProjectResult>
}

const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx|vue)$/
const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.data', '.git', 'dist', 'coverage', '.turbo', '.vercel', '.wrangler', 'migrations', 'ios', 'android'])

/** Source files of the workspace, skipping dependencies, build output and generated migrations. */
export const sourceFiles = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.') ? [] : sourceFiles(path)
    if (!SOURCE.test(entry.name) || entry.name.endsWith('.d.ts')) return []
    return (await stat(path)).size > 1_000_000 ? [] : [path]
  }))
  return nested.flat()
}

/** The migrations that apply to an upgrade of each package from `from[name]` to `to[name]`. */
export const pendingMigrations = (migrations: Migration[], from: Record<string, string>, to: Record<string, string>) =>
  migrations.filter((migration) => {
    const a = from[migration.package]
    const b = to[migration.package]
    return a && b && isBetween(migration.since, a, b)
  })

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length
const lineText = (text: string, line: number) => text.split('\n')[line - 1]!.trim().slice(0, 160)

/** Runs the migrations' rules over the files, rewriting where a rule has `replace` (unless `dryRun`). */
export const runMigrations = async (migrations: Migration[], ctx: ProjectContext) => {
  const results = new Map<Migration, MigrationResult>(migrations.map(migration => [migration, {
    migration,
    applied: [],
    manual: [],
    project: { applied: [], manual: [] },
  }]))

  for (const file of ctx.files) {
    const original = await readFile(file, 'utf-8')
    let text = original
    for (const migration of migrations) {
      const result = results.get(migration)!
      for (const rule of migration.rules ?? []) {
        if (rule.files && !rule.files.test(file)) continue
        if (rule.when && !rule.when.test(text)) continue
        if (rule.unless?.test(text)) continue
        for (const match of text.matchAll(rule.pattern)) {
          const line = lineOf(text, match.index)
          const hits = rule.replace === undefined ? result.manual : result.applied
          const last = hits.at(-1)
          if (last?.file === file && last.line === line && last.message === rule.message) continue
          hits.push({ file, line, text: lineText(text, line), message: rule.message })
        }
        if (rule.replace !== undefined) text = text.replace(rule.pattern, rule.replace)
      }
    }
    if (text !== original && !ctx.dryRun) await writeFile(file, text, 'utf-8')
  }

  for (const migration of migrations) {
    if (!migration.project) continue
    const found = await migration.project(ctx)
    const result = results.get(migration)!
    result.project = { applied: found.applied ?? [], manual: found.manual ?? [] }
  }
  return [...results.values()]
}

/** The `nuxt.config.*` files among `files`. */
export const nuxtConfigs = (files: string[]) => files.filter(file => /^nuxt\.config\.[cm]?[jt]s$/.test(basename(file)))

/**
 * The options object of each `nuxt.config` (read-only, through magicast), for checks of module options. Configs that
 * are not a plain `defineNuxtConfig({ ... })` are skipped.
 */
export const readNuxtConfigs = async (files: string[]) => {
  const configs: Array<{ file: string, options: unknown }> = []
  for (const file of nuxtConfigs(files)) {
    try {
      configs.push({ file, options: getDefaultExportOptions(parseModule(await readFile(file, 'utf-8'))) })
    }
    catch {
      // not statically readable: the rules over the file's text still run
    }
  }
  return configs
}

/** The option at a dotted `path` of a (magicast-proxied) options object, or `undefined`. */
export const option = (options: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, options)

/** The items of an array option (a magicast proxy or a plain array), or `[]`. */
export const items = (value: unknown): unknown[] =>
  value !== null && typeof value === 'object' && typeof (value as { length?: unknown }).length === 'number'
    ? Array.from(value as ArrayLike<unknown>)
    : []
