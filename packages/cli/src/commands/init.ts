import { defineCommand } from 'citty'
import consola from 'consola'
import { basename, relative, resolve } from 'node:path'
import { defineCommandArgs, templateArgs } from '../utils/args.ts'
import { installDeps, runPackageScript } from '../utils/install.ts'
import { downloadTemplateToDir, repoSource } from '../utils/template.ts'
import { isEmptyDir, renamePackage, toPackageName } from '../utils/workspace.ts'

export const STARTERS = {
  'workspace': 'apps/web: users, auth, account and admin',
  'mobile': 'apps/mobile: a Capacitor app against any OAuth issuer',
  'mobile-standalone': 'workspace + apps/mobile, with apps/web as the OAuth server',
} as const

export type Starter = keyof typeof STARTERS

const isStarter = (value: unknown): value is Starter => typeof value === 'string' && value in STARTERS

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Create a new project from a Frigear starter',
  },
  args: defineCommandArgs({
    dir: {
      type: 'positional',
      description: 'Directory to create the project in',
      required: false,
      default: 'frigear-app',
    },
    starter: {
      type: 'string',
      description: `Starter to use: ${Object.keys(STARTERS).join(', ')}`,
    },
    force: {
      type: 'boolean',
      description: 'Write into a directory that is not empty',
      default: false,
    },
    ...templateArgs,
  }),
  async run({ args }) {
    const logger = consola.withTag('init')
    const dir = resolve(args.cwd, args.dir)

    let starter: unknown = args.starter
    if (starter === undefined) {
      starter = process.stdin.isTTY
        ? await consola.prompt('Which starter?', {
            type: 'select',
            options: Object.entries(STARTERS).map(([value, hint]) => ({ value, label: value, hint })),
            initial: 'workspace',
            cancel: 'reject',
          })
        : 'workspace'
    }
    if (!isStarter(starter)) {
      logger.error(`Unknown starter "${starter}". Use one of: ${Object.keys(STARTERS).join(', ')}`)
      return process.exit(1)
    }

    if (!args.force && !(await isEmptyDir(dir))) {
      logger.error(`${dir} is not empty. Pick another directory or pass --force.`)
      return process.exit(1)
    }

    await downloadTemplateToDir({
      template: repoSource(`.starters/${starter}`, args.ref),
      path: dir,
      force: args.force,
    }).catch((error) => {
      logger.error(`Failed to download the ${starter} starter`)
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })
    await renamePackage(dir, toPackageName(basename(dir)))
    logger.success(`Created the ${starter} starter in ${dir}`)

    if (args.install) {
      logger.start('Installing dependencies')
      await installDeps(dir)
      await runPackageScript('prepare:env', dir)
    }

    const cd = relative(args.cwd, dir) || '.'
    logger.box([
      'Next steps:',
      cd === '.' ? undefined : `  cd ${cd}`,
      args.install ? undefined : '  pnpm install && pnpm prepare:env',
      ...(starter === 'mobile'
        ? ['  set NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER (and _API_BASE) in apps/mobile/.env']
        : ['  put your email in NUXT_ACL_ADMINS in apps/web/.env']),
      '  pnpm dev',
    ].filter(Boolean).join('\n'))
  },
})
