import consola, { type ConsolaInstance } from 'consola'
import { join, relative } from 'node:path'
import { readPackageJSON, writePackageJSON } from 'pkg-types'
import { installDeps, runPackageScript } from '../utils/install.ts'
import { toPosix } from '../utils/refactor.ts'
import { downloadTemplateToDir } from '../utils/template.ts'
import { findWorkspaceRoot, freePackageName, hasPackage, listDirs, packageScope, readPackage, resolveAppsDir, toPackageName, workspacePackageNames } from '../utils/workspace.ts'
import { isTemplateSource, platformRegistry, type NextStepsContext, type PlatformDefinition, type PlatformRegistry } from './define.ts'
import { PlatformError } from './errors.ts'

export interface AddPlatformOptions {
  /** Any folder of the workspace: the root, the apps folder, an app. */
  cwd: string
  /** A platform name (`web`, `mobile`, `desktop`, a project's own, or any name with `template`), or a definition. */
  platform: string | PlatformDefinition
  /** The app's folder name; defaults to the platform's `defaultAppName` or name. */
  name?: string
  /** A template name or giget source, instead of the platform's own template. */
  template?: string
  /** The folder apps go into: `auto` (default) or a path relative to `cwd`. */
  appsDir?: string
  /** Branch or tag of the frigear-nu repository for the built-in templates. */
  ref?: string
  /** Add the platform's scripts to the root package.json (default true). */
  scripts?: boolean
  /** Install the workspace's dependencies afterwards (default true). */
  install?: boolean
  /** Run the root `prepare:env` script afterwards, when there is one (default: same as `install`). */
  prepareEnv?: boolean
  logger?: ConsolaInstance
}

export interface AddPlatformResult {
  root: string
  /** The platform the app was added as. */
  platform: string
  /** The template source the app was copied from. */
  source: string
  appName: string
  /** Absolute path of the new app. */
  appDir: string
  packageName: string
  appsDir: { dir: string, covered: boolean }
  scripts: { added: string[], skipped: string[] }
  nextSteps: string[]
}

/** The scope the apps in `appsDir` use (`@workspace` in the starters), else the root package's scope. */
export const resolveAppScope = async (root: string, appsDir = join(root, 'apps')) => {
  for (const dir of await listDirs(appsDir)) {
    const scope = packageScope((await readPackage(dir))?.name)
    if (scope) return scope
  }
  return packageScope((await readPackage(root))?.name)
}

/** The platform definition for a name or definition; an unknown name is an ad hoc platform when a template is given. */
export const resolvePlatform = (registry: PlatformRegistry, platform: string | PlatformDefinition, template?: string): PlatformDefinition => {
  if (typeof platform !== 'string') return platform
  const name = platform.trim().toLowerCase()
  const known = registry.platforms[name]
  if (known) return known
  if (template) return { name }
  throw new PlatformError('UNKNOWN_PLATFORM', `Unknown platform "${platform}". Use one of ${Object.keys(registry.platforms).join(', ')}, or pass --template <name or giget source> for a platform of your own.`, {
    candidates: Object.keys(registry.platforms),
  })
}

/** The giget source for a template name or source. */
export const resolveTemplateSource = (registry: PlatformRegistry, template: string) => {
  if (registry.templates[template]) return registry.templates[template]
  if (isTemplateSource(template)) return template
  throw new PlatformError('UNKNOWN_TEMPLATE', `Unknown template "${template}". Use one of ${Object.keys(registry.templates).join(', ')}, or a giget source like gh:org/repo/path.`, {
    candidates: Object.keys(registry.templates),
  })
}

/** Replaces `<name>`, `<dir>` and `<package>` in a script name, command or step. */
export const fillPlaceholders = (text: string, values: { name: string, dir: string, package?: string }) =>
  text.replaceAll('<name>', values.name).replaceAll('<dir>', values.dir).replaceAll('<package>', values.package ?? values.name)

/** The root scripts of a platform for one app, keyed by app name. */
export const platformScripts = (platform: PlatformDefinition, appName: string, appDir: string) =>
  Object.fromEntries(Object.entries(platform.scripts ?? {}).map(([key, command]) => [
    fillPlaceholders(key, { name: appName, dir: appDir }),
    fillPlaceholders(command, { name: appName, dir: appDir }),
  ]))

/** Adds scripts to the root package.json, keeping every script that is already there. */
export const mergeRootScripts = async (root: string, scripts: Record<string, string>) => {
  const path = join(root, 'package.json')
  const pkg = await readPackageJSON(path)
  const existing = pkg.scripts ?? {}
  const added = Object.keys(scripts).filter(key => !(key in existing))
  const skipped = Object.keys(scripts).filter(key => key in existing && existing[key] !== scripts[key])
  if (added.length)
    await writePackageJSON(path, { ...pkg, scripts: { ...existing, ...Object.fromEntries(added.map(key => [key, scripts[key]!])) } })
  return { added, skipped }
}

const usesOAuthServer = async (root: string, appsDir: string) => {
  for (const dir of [...await listDirs(appsDir), ...await listDirs(join(root, 'apps'))]) {
    const pkg = await readPackage(dir)
    if (pkg?.dependencies?.['@frigear-nu/oauth-server']) return true
  }
  return false
}

/**
 * Adds an app of a platform to the workspace: copies the template into `<appsDir>/<name>`, names the package in the
 * workspace's scope, records the platform in its package.json (`frigear.platform`), adds the platform's root scripts
 * and installs. Works from any folder of the workspace.
 */
export const addPlatform = async (options: AddPlatformOptions): Promise<AddPlatformResult> => {
  const logger = options.logger ?? consola.withTag('platform')
  const root = await findWorkspaceRoot(options.cwd)
  if (!root)
    throw new PlatformError('NO_WORKSPACE', `No pnpm-workspace.yaml found above ${options.cwd}. Run \`init\` to create a project first.`)

  const rootPkg = await readPackage(root)
  const registry = platformRegistry(rootPkg, options.ref)
  const platform = resolvePlatform(registry, options.platform, options.template)
  const template = options.template ?? platform.template
  if (!template)
    throw new PlatformError('UNKNOWN_TEMPLATE', `Platform "${platform.name}" has no template. Pass --template <name or giget source>.`)
  const source = resolveTemplateSource(registry, template)

  const appsDir = await resolveAppsDir({ cwd: options.cwd, root, appsDir: options.appsDir })
  if (!appsDir.covered)
    logger.warn(`${toPosix(relative(root, appsDir.dir))} is not covered by the packages: globs of pnpm-workspace.yaml: add it, or pnpm will not install the app.`)

  const appName = toPackageName(options.name ?? platform.defaultAppName ?? platform.name)
  const appDir = join(appsDir.dir, appName)
  if (hasPackage(appDir))
    throw new PlatformError('APP_EXISTS', `App ${appName} already exists at ${appDir}. Pick another name.`)

  // Read before downloading, so the template's own package name is not mistaken for the workspace's scope.
  const scope = await resolveAppScope(root, appsDir.dir)
  await downloadTemplateToDir({ template: source, path: appDir }).catch((error: unknown) => {
    throw new PlatformError('DOWNLOAD_FAILED', `Failed to copy ${source} to ${appDir}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  })

  // A name that a workspace package, or a package the app depends on, already has (`platform add mobile` in a workspace
  // scoped `@frigear-nu`, next to `@frigear-nu/mobile`) would clash: the app gets `<name>-app` instead.
  const wanted = scope ? `${scope}/${appName}` : appName
  let packageName = wanted
  if (hasPackage(appDir)) {
    const path = join(appDir, 'package.json')
    const pkg = await readPackageJSON(path)
    const taken = await workspacePackageNames(root, [appDir])
    for (const deps of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      for (const name of Object.keys(deps ?? {})) taken.add(name)
    }
    packageName = freePackageName(wanted, taken)
    if (packageName !== wanted) logger.warn(`${wanted} is already a package of the workspace or a dependency of the app: the app's package is named ${packageName}.`)
    const frigear = pkg.frigear && typeof pkg.frigear === 'object' ? pkg.frigear as Record<string, unknown> : {}
    await writePackageJSON(path, { ...pkg, name: packageName, frigear: { ...frigear, platform: platform.name } })
  }
  logger.success(`Created ${platform.name} app ${appName} at ${appDir}`)

  const dir = `./${toPosix(relative(root, appDir))}`
  const scripts = options.scripts === false
    ? { added: [], skipped: [] }
    : await mergeRootScripts(root, platformScripts(platform, appName, dir))
  if (scripts.added.length) logger.info(`Added root scripts: ${scripts.added.join(', ')}`)
  if (scripts.skipped.length) logger.info(`Kept the root's own scripts: ${scripts.skipped.join(', ')}`)

  const install = options.install !== false
  if (install) {
    logger.start('Installing dependencies')
    await installDeps(root)
  }
  if ((options.prepareEnv ?? install) && rootPkg?.scripts?.['prepare:env'])
    await runPackageScript('prepare:env', root)

  const context: NextStepsContext = {
    appName,
    appDir: toPosix(relative(root, appDir)),
    packageName,
    root,
    hasOAuthServer: await usesOAuthServer(root, appsDir.dir),
  }
  const steps = typeof platform.nextSteps === 'function'
    ? platform.nextSteps(context)
    : (platform.nextSteps ?? []).map(step => fillPlaceholders(step, { name: appName, dir: context.appDir, package: packageName }))

  return {
    root,
    platform: platform.name,
    source,
    appName,
    appDir,
    packageName,
    appsDir,
    scripts,
    nextSteps: steps,
  }
}
