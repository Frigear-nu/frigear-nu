import { defineCommand } from 'citty'
import consola from 'consola'
import { addPlatform } from '../platform/add.ts'
import { APP_TEMPLATES } from '../platform/define.ts'
import { defineCommandArgs, templateArgs } from '../utils/args.ts'
import { appsDirArg, exitWith } from './platform/shared.ts'

export { APP_TEMPLATES } from '../platform/define.ts'
export { resolveAppScope } from '../platform/add.ts'

/** `app:create <name> --template <template>`: `platform add <template> <name>` with the template as the platform. */
export default defineCommand({
  meta: {
    name: 'app:create',
    description: 'Add an app from a Frigear starter to the workspace (same as platform add <template> <name>)',
  },
  args: defineCommandArgs({
    name: {
      type: 'positional',
      description: 'Name of the new app e.g. web',
      required: true,
    },
    template: {
      type: 'string',
      description: `App template: ${Object.keys(APP_TEMPLATES).join(', ')}, a template from frigear.templates or a giget source`,
      default: 'web',
    },
    ...appsDirArg,
    ...templateArgs,
  }),
  async run({ args }) {
    const logger = consola.withTag('app:create')
    // A built-in template is also a platform of that name; anything else is copied as is.
    const platform = args.template in APP_TEMPLATES ? args.template : args.name
    await addPlatform({
      cwd: args.cwd,
      platform,
      template: args.template,
      name: args.name,
      appsDir: args['apps-dir'],
      ref: args.ref,
      install: args.install,
      logger,
    }).catch(error => exitWith(logger, error))
  },
})
