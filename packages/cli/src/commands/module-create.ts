import { defineCommand } from 'citty'
import { resolve } from 'node:path'
import { defineCommandArgs } from '../utils/args.ts'
import { downloadTemplateToDir } from '../utils/template.ts'
import { findWorkspaceRoot, hasPackage, packageScope, readPackage, renamePackage, toPackageName } from '../utils/workspace.ts'
import consola from 'consola'

/**
 * The scope for a new module: `--scope` if given, else the root package's scope (`@frigear-nu` in this repository,
 * whose root is `@frigear-nu/root`), else none.
 */
export const resolveModuleScope = async (root: string, scope?: string) => {
  if (scope !== undefined) return scope ? `@${scope.replace(/^@/, '')}` : undefined
  return packageScope((await readPackage(root))?.name)
}

export default defineCommand({
  meta: {
    name: 'module:create',
    description: 'Create a new Nuxt Module',
  },
  args: defineCommandArgs({
    name: {
      type: 'positional',
      description: 'Name of the new Nuxt Module e.g my-module',
      required: true,
    },
    template: {
      type: 'string',
      description: 'Template to use for the new Nuxt Module e.g gh:github.com/my/package',
      default: 'gh:nuxt/starter#module',
    },
    scope: {
      type: 'string',
      description: 'npm scope of the package e.g. @acme (defaults to the root package\'s scope, "" for none)',
    },
    dir: {
      type: 'string',
      description: 'Folder of the workspace to create the module in',
      default: 'packages',
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('module:create')
    const { template } = args
    const name = toPackageName(args.name)
    const root = await findWorkspaceRoot(args.cwd) ?? resolve(args.cwd)
    const modulePath = resolve(root, args.dir, name)

    if (hasPackage(modulePath)) {
      logger.error(`Module ${name} already exists at ${modulePath}`)
      return process.exit(1)
    }

    // attempt to clone the template into the path
    const { dir } = await downloadTemplateToDir({
      template,
      path: modulePath,
      cwd: root,
    }).catch((error) => {
      logger.error(`Failed to create module ${name} at ${modulePath}`)
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })

    // ensure we set the new name in the package.json
    if (!hasPackage(dir)) {
      logger.error(`The template has no package.json at ${dir}`)
      return process.exit(1)
    }
    const scope = await resolveModuleScope(root, args.scope)
    const packageName = scope ? `${scope}/${name}` : name
    await renamePackage(dir, packageName)
    logger.log(`Created module ${packageName} at ${dir}`)
  },
})
