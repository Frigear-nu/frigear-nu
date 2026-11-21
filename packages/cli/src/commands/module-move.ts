import { defineCommand } from 'citty'
import consola from 'consola'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'
import { workspaceGlobs } from '../upgrade/manifests.ts'
import { defineCommandArgs } from '../utils/args.ts'
import { resolveLocalModule } from '../utils/local-module.ts'
import { applyPlan, findNuxtRoot, planChanges, printPlan, resolveArg, toPosix, workspaceFiles } from '../utils/refactor.ts'
import type { Move } from '../utils/refactor.ts'
import { findWorkspaceRoot, readPackage } from '../utils/workspace.ts'

/** Whether a folder (relative to the workspace root, `/` separated) matches one of the `packages:` globs. */
export const matchesWorkspaceGlobs = (path: string, globs: string[]) => globs.some((glob) => {
  const pattern = glob.replace(/\/+$/, '').split('/').map(part => part === '**'
    ? '.*'
    : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('/')
  return new RegExp(`^${pattern.replace(/\/\.\*$/, '(?:/.*)?')}$`).test(path)
})

/** Bare package imports in `text`: `@nuxt/kit` for `import { x } from '@nuxt/kit/foo'`. Skips `node:`, `#` and paths. */
export const importedPackages = (text: string) => {
  const names = new Set<string>()
  for (const match of text.matchAll(/\b(?:from|import|require)\s*(?:\(\s*)?['"]([^'"]+)['"]/g)) {
    const spec = match[1]!
    if (/^(?:[./~#]|node:|virtual:)/.test(spec) || /^@\//.test(spec) || /^@@\//.test(spec)) continue
    const parts = spec.split('/')
    names.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!)
  }
  return names
}

const dependencyNames = async (dir: string | undefined) => {
  const pkg = dir ? await readPackage(dir) : undefined
  return new Set(Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies, ...pkg?.peerDependencies }))
}

/** The nearest folder at or above `dir` with a package.json, inside `root`. */
const nearestPackageDir = (dir: string, root: string) => {
  for (let current = dir; current.startsWith(root); current = dirname(current)) {
    if (existsSync(join(current, 'package.json'))) return current
    if (dirname(current) === current) break
  }
  return undefined
}

export interface ModuleMoveOptions {
  cwd: string
  module: string
  destination: string
  /** New name for the module file or folder. */
  name?: string
  /** App whose modules/ a bare module name is looked up in. */
  app?: string
}

/**
 * Plans moving a local module (`modules/foo.ts`, `modules/foo/`) or a package folder to `destination`. Relative paths
 * out of the moved files and into them from the rest of the workspace are rewritten.
 */
export const planModuleMove = async (options: ModuleMoveOptions) => {
  const mod = await resolveLocalModule(options.cwd, options.module, options.app)
  let destination = resolveArg(options.cwd, options.destination)
  // `apps/admin` means its modules/ folder for a local module
  if (mod.kind !== 'package' && findNuxtRoot(destination, destination) === destination) destination = join(destination, 'modules')

  const name = options.name ?? mod.name
  if (!/^[\w.-]+$/.test(name)) throw new Error(`${name} is not a valid file or folder name`)
  const to = mod.kind === 'file' ? join(destination, `${name}${extname(mod.path)}`) : join(destination, name)
  if (to === mod.path) throw new Error('The module is already there')
  if (existsSync(to)) throw new Error(`${to} already exists`)
  if (mod.kind !== 'file' && (to + sep).startsWith(mod.path + sep)) throw new Error('Cannot move a folder into itself')
  if (mod.kind === 'file' && existsSync(join(destination, name))) throw new Error(`${join(destination, name)} already exists`)
  if (mod.kind === 'dir' && ['.ts', '.mts', '.js', '.mjs'].some(ext => existsSync(join(destination, `${name}${ext}`)))) {
    throw new Error(`A module file named ${name} already exists in ${destination}`)
  }

  const root = await findWorkspaceRoot(options.cwd) ?? options.cwd
  if (!to.startsWith(root + sep)) throw new Error(`${to} is outside the workspace ${root}`)
  const move: Move = { from: mod.path, to, kind: mod.kind === 'file' ? 'file' : 'dir' }
  const plan = await planChanges(root, [move])

  if (mod.kind === 'package') {
    const yamlPath = join(root, 'pnpm-workspace.yaml')
    const globs = existsSync(yamlPath) ? workspaceGlobs(await readFile(yamlPath, 'utf-8')) : []
    if (!matchesWorkspaceGlobs(toPosix(relative(root, to)), globs)) {
      plan.warnings.push(`${toPosix(relative(root, to))} is not matched by the packages: globs of pnpm-workspace.yaml (${globs.join(', ') || 'none'}): add it, or pnpm will not link it.`)
    }
  }
  else {
    // packages the module imports that the source app has and the destination does not
    const files = mod.kind === 'file' ? [mod.path] : await workspaceFiles(mod.path)
    const imported = new Set<string>()
    for (const file of files) for (const name of importedPackages(await readFile(file, 'utf-8'))) imported.add(name)
    const source = await dependencyNames(nearestPackageDir(dirname(mod.path), root))
    const target = await dependencyNames(nearestPackageDir(destination, root))
    const missing = [...imported].filter(name => source.has(name) && !target.has(name))
    if (missing.length) plan.warnings.push(`The destination's package.json lacks ${missing.join(', ')}, which the module imports.`)
  }
  return { plan, module: mod, to, root }
}

export default defineCommand({
  meta: {
    name: 'module:move',
    description: 'Move a local module or a package folder to another directory, fixing relative paths',
  },
  args: defineCommandArgs({
    module: {
      type: 'positional',
      description: 'The module: a path to modules/<name>.ts, modules/<name>/ or a package folder, or a name in the app\'s modules/',
      required: true,
    },
    destination: {
      type: 'positional',
      description: 'Directory to move it into, e.g. apps/admin/modules (an app folder means its modules/)',
      required: true,
    },
    name: {
      type: 'string',
      description: 'New file or folder name (default: keep it)',
    },
    app: {
      type: 'string',
      description: 'App whose modules/ a bare module name is looked up in',
    },
    dryRun: {
      type: 'boolean',
      description: 'Print what would change; write nothing',
      default: false,
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('module:move')
    const result = await planModuleMove({
      cwd: resolveArg(process.cwd(), args.cwd),
      module: args.module,
      destination: args.destination,
      name: args.name,
      app: args.app,
    }).catch((error) => {
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })
    if (!args.dryRun) await applyPlan(result.plan)
    const rel = (path: string) => toPosix(relative(result.root, path))
    logger.success(`${args.dryRun ? 'Would move' : 'Moved'} ${rel(result.module.path)} → ${rel(result.to)}`)
    printPlan(result.plan, 'module:move', {
      dryRun: args.dryRun,
      next: result.module.kind === 'package'
        ? ['`pnpm install` so pnpm links the package from its new folder']
        : ['Restart `nuxi dev` (or run `nuxi prepare`) in both apps: Nuxt only scans modules/ on start'],
    })
  },
})
