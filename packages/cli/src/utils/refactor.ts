import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import consola from 'consola'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Shared machinery of the commands that move or rename things in a workspace (`package:rename`, `module:folder`,
 * `module:move`): find the files, plan every change in memory, then print it (`--dry-run`) or apply it.
 */

/** A file or folder that moves. `to` must not exist yet. */
export interface Move {
  from: string
  to: string
  kind: 'file' | 'dir'
}

export interface Plan {
  root: string
  moves: Move[]
  /** New content per file, keyed by the file's path after the moves. */
  writes: Map<string, string>
  /** Files in `writes` that did not exist before. */
  created: Set<string>
  warnings: string[]
}

export const emptyPlan = (root: string): Plan => ({ root, moves: [], writes: new Map(), created: new Set(), warnings: [] })

const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.data', 'dist', 'coverage'])
const IGNORED_FILES = new Set(['package-lock.json', 'CHANGELOG.md'])
const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx|vue|json|md)$/
const JS_EXT = /\.(?:[cm]?[jt]s|tsx|jsx)$/
const RESOLVE_EXTS = ['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.vue', '.json', '.d.ts']
const NUXT_CONFIGS = ['nuxt.config.ts', 'nuxt.config.mts', 'nuxt.config.js', 'nuxt.config.mjs']

/**
 * Source files under `dir` (.ts .mts .js .mjs .vue .json .md and friends), skipping dependencies, build output, hidden
 * folders, lockfiles and changelogs.
 */
export const workspaceFiles = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.') ? [] : workspaceFiles(path)
    if (!entry.isFile() || !SOURCE.test(entry.name) || IGNORED_FILES.has(entry.name)) return []
    return (await stat(path)).size > 1_000_000 ? [] : [path]
  }))
  return nested.flat()
}

/** `/` separated path, for specifiers and messages. */
export const toPosix = (path: string) => path.split(sep).join('/')

const isInside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep)

const stripExt = (path: string) => JS_EXT.test(path) ? path.slice(0, -extname(path).length) : path

/** Where `path` ends up after `moves`, or `undefined` when it does not move. */
export const relocate = (path: string, moves: Move[]) => {
  for (const move of moves) {
    if (move.kind === 'dir') {
      if (isInside(path, move.from)) return move.to + path.slice(move.from.length)
      continue
    }
    if (path === move.from) return move.to
    // an import of the file: `./foo` (no extension), or `./foo.js` for `foo.ts`
    const ext = extname(path)
    if (ext && !JS_EXT.test(path)) continue
    if (stripExt(path) !== stripExt(move.from)) continue
    const stem = stripExt(move.to)
    if (!ext) return basename(stem) === 'index' ? dirname(stem) : stem
    return stem + ext
  }
  return undefined
}

/** Whether a resolved specifier points at something on disk (trying extensions and `index` files). */
export const targetExists = (abs: string) => {
  if (existsSync(abs)) return true
  const stem = stripExt(abs)
  return RESOLVE_EXTS.some(ext => existsSync(stem + ext))
}

/** The nearest directory at or above `dir` with a `nuxt.config`, staying inside `root`. */
export const findNuxtRoot = (dir: string, root: string): string | undefined => {
  for (let current = dir; isInside(current, root); current = dirname(current)) {
    if (NUXT_CONFIGS.some(file => existsSync(join(current, file)))) return current
    if (dirname(current) === current) break
  }
  return undefined
}

type Alias = '~' | '~~' | '@' | '@@'

/** The directory a Nuxt alias points at for a file in `nuxtRoot`: `~~`/`@@` the root, `~`/`@` its `app/` (Nuxt 4) or the root. */
const aliasBase = (alias: Alias, nuxtRoot: string) =>
  alias === '~~' || alias === '@@' ? nuxtRoot : existsSync(join(nuxtRoot, 'app')) ? join(nuxtRoot, 'app') : nuxtRoot

const ALIAS = /^(~~|@@|~|@)\//

/** A string literal holding a relative path or a Nuxt alias path: `'./x'`, `"../x"`, `'~~/modules/x'`. */
const SPECIFIER = /(['"`])((?:\.\.?|~~?|@@?)\/[^'"`\n]*)\1/g
/** A relative Markdown link target: `](./packages/forms)`. */
const MARKDOWN_LINK = /(\]\()(\.\.?\/[^)\s#?]*)/g

/** `./x` style specifier from `fromDir` to `abs`. */
export const relativeSpecifier = (fromDir: string, abs: string) => {
  const rel = toPosix(relative(fromDir, abs)) || '.'
  return rel.startsWith('.') ? rel : `./${rel}`
}

export interface RewriteContext {
  root: string
  moves: Move[]
  warnings: string[]
}

/**
 * `text` (of `file`, at its path before the moves) with every relative or alias path literal that is affected by
 * `ctx.moves` rewritten: paths into a moved file or folder follow it, and when `file` itself moves, its paths out of
 * the moved set are made relative to its new place. Literals that do not resolve to anything on disk are left alone.
 * In Markdown, relative link targets are rewritten instead.
 */
export const rewritePaths = (text: string, file: string, ctx: RewriteContext) => {
  if (!ctx.moves.length) return text
  const newFile = relocate(file, ctx.moves) ?? file
  const fileMoves = newFile !== file
  const oldDir = dirname(file)
  const newDir = dirname(newFile)
  const nuxtRoot = findNuxtRoot(oldDir, ctx.root)

  const rewrite = (spec: string): string | undefined => {
    if (spec.includes('${')) return undefined
    const alias = spec.match(ALIAS)?.[1] as Alias | undefined
    let abs: string
    if (alias) {
      if (!nuxtRoot) return undefined
      abs = join(aliasBase(alias, nuxtRoot), spec.slice(alias.length + 1))
    }
    else abs = resolve(oldDir, spec)

    const moved = relocate(abs, ctx.moves)
    if (!moved && !fileMoves) return undefined
    if (!moved && !targetExists(abs)) return undefined
    const newAbs = moved ?? abs
    const trailing = spec.endsWith('/') && !newAbs.endsWith('/') ? '/' : ''

    if (alias) {
      const movedRoot = nuxtRoot ? relocate(nuxtRoot, ctx.moves) : undefined
      const newRoot = movedRoot ?? findNuxtRoot(newDir, ctx.root) ?? nuxtRoot!
      if (!moved) {
        // only `file` moves: the alias keeps its text, and now resolves against the app it moved to
        if (newRoot !== nuxtRoot && !movedRoot) {
          ctx.warnings.push(`${toPosix(relative(ctx.root, newFile))}: \`${spec}\` now resolves against ${toPosix(relative(ctx.root, newRoot)) || '.'}`)
        }
        return undefined
      }
      const base = aliasBase(alias, newRoot)
      if (isInside(newAbs, base)) {
        const next = `${alias}/${toPosix(relative(base, newAbs))}${trailing}`
        return next === spec ? undefined : next
      }
    }
    const next = relativeSpecifier(newDir, newAbs) + trailing
    return next === spec ? undefined : next
  }

  if (file.endsWith('.md')) {
    return text.replace(MARKDOWN_LINK, (all, head: string, spec: string) => {
      const next = rewrite(spec)
      return next === undefined ? all : `${head}${next}`
    })
  }
  return text.replace(SPECIFIER, (all, quote: string, spec: string) => {
    const next = rewrite(spec)
    return next === undefined ? all : `${quote}${next}${quote}`
  })
}

/**
 * Builds a plan: every workspace file under `root` goes through `rewrite` (if given) and then `rewritePaths` for
 * `moves`; changed files are recorded at their path after the moves.
 */
export const planChanges = async (root: string, moves: Move[], rewrite?: (file: string, text: string) => string) => {
  const plan = emptyPlan(root)
  plan.moves.push(...moves)
  const ctx: RewriteContext = { root, moves, warnings: plan.warnings }
  const files = new Set(await workspaceFiles(root))
  // a moved file outside the scanned folders (a hidden one) still has its paths fixed
  for (const move of moves) {
    if (move.kind === 'file' && SOURCE.test(move.from)) files.add(move.from)
  }
  for (const file of files) {
    const original = await readFile(file, 'utf-8')
    let text = rewrite ? rewrite(file, original) : original
    text = rewritePaths(text, file, ctx)
    if (text !== original) plan.writes.set(relocate(file, moves) ?? file, text)
  }
  return plan
}

/** Applies a plan: moves first, then writes. */
export const applyPlan = async (plan: Plan) => {
  for (const move of plan.moves) {
    if (existsSync(move.to)) throw new Error(`${move.to} already exists`)
    await mkdir(dirname(move.to), { recursive: true })
    await rename(move.from, move.to)
  }
  for (const [file, text] of plan.writes) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text, 'utf-8')
  }
}

/** The plan as lines for the terminal: moves, then created and changed files, relative to the root. */
export const describePlan = (plan: Plan) => {
  const rel = (path: string) => toPosix(relative(plan.root, path)) || '.'
  const lines: string[] = []
  for (const move of plan.moves) lines.push(`moved    ${rel(move.from)}${move.kind === 'dir' ? '/' : ''} → ${rel(move.to)}${move.kind === 'dir' ? '/' : ''}`)
  const files = [...plan.writes.keys()].sort()
  for (const file of files) lines.push(`${plan.created.has(file) ? 'created' : 'changed'}  ${rel(file)}`)
  return lines
}

/** Resolves a path argument against `cwd` (absolute paths are kept). */
export const resolveArg = (cwd: string, path: string) => isAbsolute(path) ? path : resolve(cwd, path)

/** Prints a plan with consola: the changes, the warnings, and `next` steps. */
export const printPlan = (plan: Plan, tag: string, options: { dryRun?: boolean, next?: string[] }) => {
  const logger = consola.withTag(tag)
  const lines = describePlan(plan)
  if (!lines.length) logger.info('Nothing to change.')
  else logger.log(`${options.dryRun ? 'Would change' : 'Changed'} ${lines.length} ${lines.length === 1 ? 'path' : 'paths'}:\n${lines.map(line => `  ${line}`).join('\n')}`)
  for (const warning of plan.warnings) logger.warn(warning)
  if (options.dryRun) logger.info('Dry run: nothing was written.')
  else if (options.next?.length) logger.info(`Next:\n${options.next.map(step => `  ${step}`).join('\n')}`)
}
