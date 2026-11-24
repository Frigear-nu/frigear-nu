import { defineCommand } from 'citty'
import consola from 'consola'
import { relative } from 'node:path'
import { addPlatform, type AddPlatformResult } from '../../platform/add.ts'
import { PlatformError } from '../../platform/errors.ts'
import { defineCommandArgs, templateArgs } from '../../utils/args.ts'
import { toPackageName } from '../../utils/workspace.ts'
import { appsDirArg, exitWith } from './shared.ts'

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add an app of a platform (web, mobile, desktop, or your own) to the workspace',
  },
  args: defineCommandArgs({
    platform: {
      type: 'positional',
      description: 'Platform: web, web-standalone, mobile, desktop, or one from frigear.platforms in the root package.json',
      required: true,
    },
    name: {
      type: 'positional',
      description: 'Folder name of the app (default: the platform name)',
      required: false,
    },
    template: {
      type: 'string',
      alias: ['t'],
      description: 'Template name (web, web-standalone, mobile, desktop, or frigear.templates) or a giget source',
    },
    scripts: {
      type: 'boolean',
      description: 'Add the platform\'s scripts to the root package.json (--no-scripts to skip)',
      default: true,
    },
    ...appsDirArg,
    ...templateArgs,
  }),
  async run({ args }) {
    const logger = consola.withTag('platform add')
    const options = {
      cwd: args.cwd,
      platform: args.platform,
      template: args.template,
      appsDir: args['apps-dir'],
      ref: args.ref,
      scripts: args.scripts,
      install: args.install,
      logger,
    }

    let name = args.name
    let result: AddPlatformResult | undefined
    while (!result) {
      try {
        result = await addPlatform({ ...options, name })
      }
      catch (error) {
        // A second app of the same platform: ask for another name instead of failing.
        if (error instanceof PlatformError && error.code === 'APP_EXISTS' && process.stdin.isTTY) {
          logger.warn(error.message)
          const answer = await consola.prompt('Name of the new app', { type: 'text', cancel: 'reject' }) as string
          name = toPackageName(answer)
          if (!name) return exitWith(logger, error)
          continue
        }
        return exitWith(logger, error)
      }
    }

    const cd = relative(args.cwd, result.root)
    logger.box([
      'Next steps:',
      cd ? `  cd ${cd}` : undefined,
      args.install ? undefined : '  pnpm install',
      ...result.nextSteps,
      `  pnpm dev:${result.appName}`,
      result.scripts.added.some(key => key.startsWith('dev:')) ? `  (add --filter ./${relative(result.root, result.appDir)} to the root "dev" script to start it with the others)` : undefined,
    ].filter(Boolean).join('\n'))
  },
})
