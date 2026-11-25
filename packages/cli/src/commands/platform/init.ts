import { defineCommand } from 'citty'
import consola from 'consola'
import { initPlatform } from '../../platform/init.ts'
import { PlatformError } from '../../platform/errors.ts'
import { defineCommandArgs } from '../../utils/args.ts'
import { appsDirArg, exitWith, passThroughArgs } from './shared.ts'

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Set up a native target in an app: ios, android, apple-watch, tauri, or your platform\'s own (extra flags after --)',
  },
  args: defineCommandArgs({
    target: {
      type: 'positional',
      description: 'Target: ios, android, apple-watch (watchos), tauri (desktop), or one from frigear.platforms',
      required: true,
    },
    app: {
      type: 'string',
      description: 'The app: a folder under the apps folder, or a path (default: the app you are in, or the only one with the target)',
    },
    ...appsDirArg,
  }),
  async run({ args, rawArgs }) {
    const logger = consola.withTag('platform init')
    const options = { cwd: args.cwd, target: args.target, appsDir: args['apps-dir'], args: passThroughArgs(rawArgs), logger }
    try {
      await initPlatform({ ...options, app: args.app })
    }
    catch (error) {
      if (error instanceof PlatformError && error.code === 'APP_AMBIGUOUS' && process.stdin.isTTY && error.candidates?.length) {
        const app = await consola.prompt(`Which app gets ${args.target}?`, { type: 'select', options: error.candidates, cancel: 'reject' }) as string
        await initPlatform({ ...options, app }).catch(retry => exitWith(logger, retry))
        return
      }
      exitWith(logger, error)
    }
  },
})
