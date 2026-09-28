import { defineCommand } from 'citty'
import { kebabCase } from 'scule'
import { join, resolve } from 'node:path'
import { defineCommandArgs } from '../utils/args.ts'
import { readPackageJson, writePackageJson } from '../utils/files.ts'
import { downloadTemplateToDir } from '../utils/template.ts'
import consola from 'consola'

export default defineCommand({
  meta: {
    name: 'create',
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
  }),
  async run({ args }) {
    const logger = consola.withTag('module:create')
    const { name, template } = args
    const cwd = resolve(args.cwd)
    const modulePath = resolve(cwd, 'packages', kebabCase(name))

    const existingModule = await readPackageJson(modulePath).catch(() => null)
    if (existingModule) {
      logger.error(`Module ${name} already exists at ${modulePath}`)
      return process.exit(1)
    }

    // attempt to clone the template into the path
    const dir = await downloadTemplateToDir({
      template,
      path: modulePath,
      cwd,
    }).catch((error) => {
      logger.error(`Failed to create module ${name} at ${modulePath}`)
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })

    // ensure we set the new name in the package.json
    const packageJsonPath = join(dir, 'package.json')
    const packageJson = await readPackageJson(packageJsonPath).catch(() => null)
    if (!packageJson) {
      logger.error(`Failed to read package.json at ${packageJsonPath}`)
      return process.exit(1)
    }
    await writePackageJson(packageJsonPath, {
      ...packageJson || {},
      name,
    })
    logger.log(`Created module ${name} at ${dir}`)
  },
})
