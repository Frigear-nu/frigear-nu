import consola, { type ConsolaInstance } from 'consola'
import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { PackageJson } from 'pkg-types'
import { execBin, runPackageScript } from '../utils/install.ts'
import { toPosix } from '../utils/refactor.ts'
import { findWorkspaceRoot, hasPackage, isInside, listDirs, readPackage, resolveAppsDir } from '../utils/workspace.ts'
import { findTarget, platformRegistry, type PlatformDefinition, type PlatformRegistry, type PlatformTarget } from './define.ts'
import { PlatformError } from './errors.ts'

export interface WorkspaceApp {
  /** Folder name, e.g. `mobile`. */
  name: string
  /** Absolute path. */
  dir: string
  pkg: PackageJson
  /** The platform from `frigear.platform`, else detected from its dependencies. */
  platform?: PlatformDefinition
}

/** The platform of an app: its `frigear.platform` field, else the first platform whose `detect` matches (`web` last). */
export const detectAppPlatform = (registry: PlatformRegistry, pkg: PackageJson) => {
  const own = (pkg.frigear as { platform?: unknown } | undefined)?.platform
  if (typeof own === 'string' && registry.platforms[own]) return registry.platforms[own]
  const ordered = Object.values(registry.platforms).sort((a, b) => Number(a.name === 'web') - Number(b.name === 'web'))
  return ordered.find(platform => platform.detect?.(pkg))
}

/** The apps of the workspace (folders with a package.json in the apps folder) and their platforms. */
export const listWorkspaceApps = async (appsDir: string, registry: PlatformRegistry): Promise<WorkspaceApp[]> => {
  const apps: WorkspaceApp[] = []
  for (const dir of await listDirs(appsDir)) {
    const pkg = await readPackage(dir)
    if (pkg) apps.push({ name: relative(appsDir, dir), dir, pkg, platform: detectAppPlatform(registry, pkg) })
  }
  return apps
}

export interface ResolvePlatformAppOptions {
  cwd: string
  root: string
  appsDir: string
  registry: PlatformRegistry
  target: string
  /** A folder name under the apps folder, or a path relative to `cwd`. */
  app?: string
}

/** The app to set a target up in: `app`, else the app `cwd` is in, else the only app whose platform has the target. */
export const resolvePlatformApp = async (options: ResolvePlatformAppOptions): Promise<WorkspaceApp> => {
  const apps = await listWorkspaceApps(options.appsDir, options.registry)
  if (options.app) {
    const dirs = [join(options.appsDir, options.app), resolve(options.cwd, options.app)]
    const app = apps.find(candidate => dirs.includes(candidate.dir))
    if (app) return app
    const dir = dirs.find(hasPackage)
    if (dir) {
      const pkg = (await readPackage(dir))!
      return { name: relative(options.appsDir, dir), dir, pkg, platform: detectAppPlatform(options.registry, pkg) }
    }
    throw new PlatformError('APP_NOT_FOUND', `No app ${options.app} in ${options.appsDir}.`, { candidates: apps.map(app => app.name) })
  }
  const current = apps.find(app => isInside(resolve(options.cwd), app.dir))
  if (current) return current

  const matching = apps.filter(app => app.platform && findTarget(app.platform, options.target))
  if (matching.length === 1) return matching[0]!
  if (matching.length === 0)
    throw new PlatformError('APP_NOT_FOUND', `No app in ${toPosix(relative(options.root, options.appsDir)) || '.'} has the target "${options.target}". Add one with \`platform add\`, or pass --app <name>.`, {
      candidates: apps.map(app => app.name),
    })
  throw new PlatformError('APP_AMBIGUOUS', `Several apps have the target "${options.target}" (${matching.map(app => app.name).join(', ')}). Pass --app <name>.`, {
    candidates: matching.map(app => app.name),
  })
}

export interface InitPlatformOptions {
  /** Any folder of the workspace. */
  cwd: string
  /** `ios`, `android`, `apple-watch`, `tauri`, or a target of a project's own platform. */
  target: string
  /** The app: a folder name under the apps folder, or a path. */
  app?: string
  /** The folder apps live in: `auto` (default) or a path relative to `cwd`. */
  appsDir?: string
  /** Extra arguments for the script or binary. */
  args?: string[]
  /** Only work out what would run. */
  dryRun?: boolean
  logger?: ConsolaInstance
}

export interface InitPlatformResult {
  root: string
  app: WorkspaceApp
  platform: string
  target: string
  /** What runs (or would run): `script <name> ...` or `exec <bin> ...`. */
  command: { kind: 'script' | 'exec', name: string, args: string[] }
}

/** How a target runs in an app: its script when the app has it, else the binary. */
export const targetCommand = (target: PlatformTarget, pkg: PackageJson, extra: string[] = []): InitPlatformResult['command'] | undefined => {
  const args = [...target.args ?? [], ...extra]
  if (target.script && pkg.scripts?.[target.script]) return { kind: 'script', name: target.script, args }
  if (target.bin?.length) return { kind: 'exec', name: target.bin[0]!, args: [...target.bin.slice(1), ...args] }
  return undefined
}

/** Sets up a target (`ios`, `apple-watch`, `tauri`, ...) in an app of the workspace, through the app's own tooling. */
export const initPlatform = async (options: InitPlatformOptions): Promise<InitPlatformResult> => {
  const logger = options.logger ?? consola.withTag('platform')
  const root = await findWorkspaceRoot(options.cwd)
  if (!root)
    throw new PlatformError('NO_WORKSPACE', `No pnpm-workspace.yaml found above ${options.cwd}.`)
  const registry = platformRegistry(await readPackage(root))
  const { dir: appsDir } = await resolveAppsDir({ cwd: options.cwd, root, appsDir: options.appsDir })
  const app = await resolvePlatformApp({ cwd: options.cwd, root, appsDir, registry, target: options.target, app: options.app })

  const found = app.platform ? findTarget(app.platform, options.target) : undefined
  if (!app.platform || !found) {
    const targets = Object.keys(app.platform?.targets ?? {})
    throw new PlatformError('UNKNOWN_TARGET', `App ${app.name}${app.platform ? ` (${app.platform.name})` : ''} has no target "${options.target}"${targets.length ? `; it has ${targets.join(', ')}` : ''}.`, {
      candidates: targets,
    })
  }
  const command = targetCommand(found.target, app.pkg, options.args)
  if (!command)
    throw new PlatformError('UNKNOWN_TARGET', `App ${app.name} has no "${found.target.script}" script, and the target names no binary to run instead.`)

  const result: InitPlatformResult = { root, app, platform: app.platform.name, target: found.id, command }
  if (options.dryRun) return result

  logger.start(`Setting up ${found.id} in ${toPosix(relative(root, app.dir))}`)
  if (command.kind === 'script') await runPackageScript(command.name, app.dir, command.args)
  else {
    if (!existsSync(join(app.dir, 'node_modules')))
      logger.warn(`${app.name} has no node_modules yet: run the install first if ${command.name} is not found.`)
    await execBin(command.name, command.args, app.dir)
  }
  return result
}
