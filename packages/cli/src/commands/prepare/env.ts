import { defineCommand } from 'citty'
import consola from 'consola'
import { describeEnvResult, prepareEnv } from '../../env/prepare.ts'
import { defineCommandArgs } from '../../utils/args.ts'
import { findWorkspaceRoot } from '../../utils/workspace.ts'

export default defineCommand({
  meta: {
    name: 'env',
    description: 'Create each app\'s .env from its .env.example and fill in empty secrets',
  },
  args: defineCommandArgs({
    'dry-run': {
      type: 'boolean',
      description: 'Show what would change without writing anything',
      default: false,
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('prepare env')
    const root = await findWorkspaceRoot(args.cwd) ?? args.cwd
    try {
      const results = await prepareEnv({ root, dryRun: args['dry-run'] })
      if (!results.length) logger.info('No .env.example files found.')
      for (const result of results) logger.log(`${args['dry-run'] ? '(dry run) ' : ''}${describeEnvResult(result)}`)
    }
    catch (error) {
      logger.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  },
})
