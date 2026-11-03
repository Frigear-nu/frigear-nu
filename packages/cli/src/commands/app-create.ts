import { defineCommand } from 'citty'
import consola from 'consola'
import { join } from 'node:path'
import { kebabCase } from 'scule'
import { defineCommandArgs, templateArgs } from '../utils/args.ts'
import { installDeps } from '../utils/install.ts'
import { downloadTemplateToDir, repoSource } from '../utils/template.ts'
import { findWorkspaceRoot, hasPackage, listDirs, packageScope, readPackage, renamePackage } from '../utils/workspace.ts'

/** App templates, as paths in the frigear-nu repository. */
export const APP_TEMPLATES = {
  'web': '.starters/workspace/apps/web',
  'web-standalone': '.starters/mobile-standalone/apps/web',
  'mobile': '.starters/mobile/apps/mobile',
} as const

const isAppTemplate = (value: string): value is keyof typeof APP_TEMPLATES => value in APP_TEMPLATES

/** The scope the workspace's apps use (`@workspace` in the starters), else the root package's scope. */
export const resolveAppScope = async (root: string) => {
  for (const dir of await listDirs(join(root, 'apps'))) {
    const scope = packageScope((await readPackage(dir))?.name)
    if (scope) return scope
  }
  return packageScope((await readPackage(root))?.name)
}

export default defineCommand({
  meta: {
    name: 'app:create',
    description: 'Add an app from a Frigear starter to apps/<name> of a pnpm workspace',
  },
  args: defineCommandArgs({
    name: {
      type: 'positional',
      description: 'Name of the new app e.g. web',
      required: true,
    },
    template: {
      type: 'string',
      description: `App template: ${Object.keys(APP_TEMPLATES).join(', ')}`,
      default: 'web',
    },
    ...templateArgs,
  }),
  async run({ args }) {
    const logger = consola.withTag('app:create')
    const { template } = args
    if (!isAppTemplate(template)) {
      logger.error(`Unknown template "${template}". Use one of: ${Object.keys(APP_TEMPLATES).join(', ')}`)
      return process.exit(1)
    }

    const root = await findWorkspaceRoot(args.cwd)
    if (!root) {
      logger.error(`No pnpm-workspace.yaml found above ${args.cwd}. Run \`init\` to create a project first.`)
      return process.exit(1)
    }

    const name = kebabCase(args.name)
    const appPath = join(root, 'apps', name)
    if (hasPackage(appPath)) {
      logger.error(`App ${name} already exists at ${appPath}`)
      return process.exit(1)
    }

    // Read before downloading, so the template's own package name is not mistaken for the workspace's scope.
    const scope = await resolveAppScope(root)
    await downloadTemplateToDir({ template: repoSource(APP_TEMPLATES[template], args.ref), path: appPath })
      .catch((error) => {
        logger.error(`Failed to create app ${name} at ${appPath}`)
        logger.error(error instanceof Error ? error.message : error)
        return process.exit(1)
      })

    await renamePackage(appPath, scope ? `${scope}/${name}` : name)
    logger.success(`Created app ${name} at ${appPath}`)

    if (args.install) {
      logger.start('Installing dependencies')
      await installDeps(root)
    }
  },
})
