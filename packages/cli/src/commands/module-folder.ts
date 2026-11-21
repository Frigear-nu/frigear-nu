import { defineCommand } from 'citty'
import consola from 'consola'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { defineCommandArgs } from '../utils/args.ts'
import { resolveLocalModule } from '../utils/local-module.ts'
import { applyPlan, planChanges, printPlan, resolveArg, toPosix } from '../utils/refactor.ts'
import { findWorkspaceRoot } from '../utils/workspace.ts'

/** The stub `--runtime` creates in `runtime/plugin.ts`. */
export const runtimePluginStub = (name: string) => `import { defineNuxtPlugin } from '#imports'

// Runtime code of the ${name} module. Register it in the module's setup():
//   addPlugin(createResolver(import.meta.url).resolve('./runtime/plugin'))
export default defineNuxtPlugin(() => {})
`

/** How to reach runtime files from a module that has no resolver yet. */
export const resolverHint = (name: string) => [
  `modules/${name}/index.ts has no createResolver(import.meta.url). Add runtime files from setup() with:`,
  `  import { addPlugin, createResolver } from '@nuxt/kit'`,
  `  const { resolve } = createResolver(import.meta.url)`,
  `  addPlugin(resolve('./runtime/plugin'))`,
].join('\n')

export interface ModuleFolderOptions {
  cwd: string
  module: string
  app?: string
  /** Create `runtime/plugin.ts`. */
  runtime?: boolean
}

/**
 * Plans turning `modules/foo.ts` into `modules/foo/index.ts`: the file moves, its relative imports gain a `../`, and
 * imports of it that name the file with its extension follow it.
 */
export const planModuleFolder = async (options: ModuleFolderOptions) => {
  const mod = await resolveLocalModule(options.cwd, options.module, options.app)
  if (mod.kind !== 'file') throw new Error(`${options.module} is already a folder${mod.kind === 'package' ? ' (a package)' : ' module'}`)
  const ext = extname(mod.path)
  const folder = join(dirname(mod.path), mod.name)
  if (existsSync(folder)) throw new Error(`${folder} already exists`)

  const root = await findWorkspaceRoot(dirname(mod.path)) ?? dirname(dirname(mod.path))
  const index = join(folder, `index${ext}`)
  const plan = await planChanges(root, [{ from: mod.path, to: index, kind: 'file' }])
  if (options.runtime) {
    const plugin = join(folder, 'runtime', `plugin${ext === '.mts' || ext === '.ts' ? '.ts' : '.js'}`)
    plan.writes.set(plugin, runtimePluginStub(mod.name))
    plan.created.add(plugin)
  }
  const source = plan.writes.get(index) ?? await readFile(mod.path, 'utf-8')
  const hint = /createResolver\s*\(\s*import\.meta\.url\s*\)/.test(source) ? undefined : resolverHint(mod.name)
  return { plan, module: mod, folder, index, hint, root }
}

export default defineCommand({
  meta: {
    name: 'module:folder',
    description: 'Turn a single-file local module (modules/foo.ts) into a folder module (modules/foo/index.ts)',
  },
  args: defineCommandArgs({
    module: {
      type: 'positional',
      description: 'The module: a path to modules/<name>.ts, or a name in the app\'s modules/',
      required: true,
    },
    app: {
      type: 'string',
      description: 'App whose modules/ a bare name is looked up in: a path, or a folder under apps/',
    },
    runtime: {
      type: 'boolean',
      description: 'Also create runtime/plugin.ts',
      default: false,
    },
    dryRun: {
      type: 'boolean',
      description: 'Print what would change; write nothing',
      default: false,
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('module:folder')
    const result = await planModuleFolder({ cwd: resolveArg(process.cwd(), args.cwd), module: args.module, app: args.app, runtime: args.runtime })
      .catch((error) => {
        logger.error(error instanceof Error ? error.message : error)
        return process.exit(1)
      })
    if (!args.dryRun) await applyPlan(result.plan)
    logger.success(`${args.dryRun ? 'Would move' : 'Moved'} ${result.module.name} to ${toPosix(relative(result.root, result.index))}`)
    printPlan(result.plan, 'module:folder', {
      dryRun: args.dryRun,
      next: ['Restart `nuxi dev` (or run `nuxi prepare`): Nuxt loads modules/<name>/index.ts like modules/<name>.ts'],
    })
    if (result.hint) logger.info(result.hint)
  },
})
