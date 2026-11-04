import { defineCommand } from 'citty'
import consola from 'consola'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { generateCode, parseModule } from 'magicast'
import { addNuxtModule, getDefaultExportOptions } from 'magicast/helpers'
import { defineCommandArgs } from '../utils/args.ts'
import { addDeps } from '../utils/install.ts'
import { findWorkspaceRoot, listDirs, readPackage } from '../utils/workspace.ts'

const NUXT_CONFIGS = ['nuxt.config.ts', 'nuxt.config.mts', 'nuxt.config.js', 'nuxt.config.mjs']

/** `forms` → `@frigear-nu/forms`; scoped names and paths are kept. */
export const resolveModuleName = (name: string) => name.includes('/') ? name : `@frigear-nu/${name}`

const findNuxtConfig = (dir: string) => NUXT_CONFIGS.map(file => join(dir, file)).find(existsSync)

/**
 * The app to add the module to: `--app` (a path, or a folder under `apps/`), else `cwd` when it is a Nuxt app, else
 * the only Nuxt app under the workspace's `apps/`.
 */
export const resolveTargetApp = async (cwd: string, app?: string) => {
  if (app) {
    const root = await findWorkspaceRoot(cwd) ?? cwd
    const candidates = [resolve(cwd, app), join(root, 'apps', app)]
    const dir = candidates.find(findNuxtConfig)
    if (!dir) throw new Error(`No nuxt.config found in ${candidates.join(' or ')}`)
    return dir
  }
  if (findNuxtConfig(cwd)) return cwd

  const root = await findWorkspaceRoot(cwd)
  const apps = root ? (await listDirs(join(root, 'apps'))).filter(findNuxtConfig) : []
  if (apps.length === 1) return apps[0]!
  if (apps.length === 0) throw new Error(`No Nuxt app found in ${cwd}. Pass --app <dir>.`)
  throw new Error(`Several Nuxt apps found (${apps.map(dir => relative(root!, dir)).join(', ')}). Pass --app <name>.`)
}

/** Adds the modules to `modules` in the Nuxt config file. Returns the ones that were not there yet. */
export const addModulesToConfig = async (configPath: string, modules: string[]) => {
  const mod = parseModule(await readFile(configPath, 'utf-8'))
  const config = getDefaultExportOptions(mod)
  const added = modules.filter(name => !config.modules?.includes(name))
  for (const name of added) addNuxtModule(mod, name)
  if (added.length) await writeFile(configPath, `${generateCode(mod).code.trimEnd()}\n`, 'utf-8')
  return added
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Install Frigear modules in a Nuxt app and add them to its nuxt.config',
  },
  args: defineCommandArgs({
    modules: {
      type: 'positional',
      description: 'Modules to add e.g. forms or @frigear-nu/forms',
      required: true,
    },
    app: {
      type: 'string',
      description: 'App to add the modules to: a path, or a folder under apps/',
    },
    install: {
      type: 'boolean',
      description: 'Install the packages (--no-install to only edit nuxt.config)',
      default: true,
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('add')
    // `args.modules` is only the first positional; `args._` holds all of them
    const modules = [...new Set(args._.map(String).map(resolveModuleName))]

    const appDir = await resolveTargetApp(resolve(args.cwd), args.app).catch((error) => {
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })
    const configPath = findNuxtConfig(appDir)!

    if (args.install) {
      logger.start(`Installing ${modules.join(', ')} in ${appDir}`)
      await addDeps(modules, appDir)
    }

    const added = await addModulesToConfig(configPath, modules).catch((error) => {
      logger.warn(`Could not edit ${configPath}: ${error instanceof Error ? error.message : error}`)
      logger.info(`Add these to \`modules\` yourself:\n${modules.map(name => `  '${name}',`).join('\n')}`)
      return undefined
    })
    if (added) {
      if (added.length) logger.success(`Added ${added.join(', ')} to ${configPath}`)
      else logger.info(`Already in ${configPath}`)
    }

    for (const name of modules) {
      const homepage = (await readPackage(join(appDir, 'node_modules', name)).catch(() => undefined))?.homepage
      if (homepage) logger.info(`${name}: options, policies and migrations at ${homepage}`)
    }
    logger.info('Modules that add tables need a migration: run `pnpm db:generate` and commit it.')
  },
})
