import { defineCommand } from 'citty'
import consola from 'consola'
import { basename, relative, resolve } from 'node:path'
import { defineCommandArgs, templateArgs } from '../utils/args.ts'
import { installDeps, runPackageScript } from '../utils/install.ts'
import { downloadTemplateToDir, repoSource } from '../utils/template.ts'
import { hasPackage, isEmptyDir, readPackage, renamePackage, toPackageName } from '../utils/workspace.ts'

export const PLATFORMS = ['web', 'mobile'] as const

export type Platform = typeof PLATFORMS[number]

/** Each starter (a folder under `.starters/`) and the platforms it builds for. */
export const STARTERS = {
  'workspace': { platforms: ['web'], hint: 'apps/web: users, auth, account and admin' },
  'mobile': { platforms: ['mobile'], hint: 'apps/mobile: a Capacitor app against any OAuth issuer' },
  'mobile-standalone': { platforms: ['web', 'mobile'], hint: 'apps/web + apps/mobile, with apps/web as the OAuth server' },
} as const satisfies Record<string, { platforms: readonly Platform[], hint: string }>

export type Starter = keyof typeof STARTERS

const isStarter = (value: string): value is Starter => value in STARTERS

/**
 * A starter from its name (`mobile-standalone`) or from its platforms (`web`, `mobile`, `web,mobile`, in any order).
 */
export const resolveStarter = (value: string): Starter | undefined => {
  const input = value.trim().toLowerCase()
  if (isStarter(input))
    return input
  const platforms = new Set(input.split(',').map(platform => platform.trim()).filter(Boolean))
  return (Object.keys(STARTERS) as Starter[]).find((starter) => {
    const own: readonly string[] = STARTERS[starter].platforms
    return own.length === platforms.size && own.every(platform => platforms.has(platform))
  })
}

const choices = `${PLATFORMS.join(', ')}, ${PLATFORMS.join(',')} or a starter: ${Object.keys(STARTERS).join(', ')}`

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Create a new project from a Frigear starter or any giget template',
  },
  args: defineCommandArgs({
    dir: {
      type: 'positional',
      description: 'Directory to create the project in',
      required: false,
      default: 'frigear-app',
    },
    platform: {
      type: 'string',
      alias: ['starter'],
      description: `What to build (default web): ${choices}`,
    },
    template: {
      type: 'string',
      alias: ['t'],
      description: 'A giget source to copy instead of a starter, e.g. gh:org/repo/path#ref',
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

    let starter: Starter | undefined
    if (args.template !== undefined) {
      if (args.platform !== undefined) {
        logger.error('Pass either --template or --platform, not both.')
        return process.exit(1)
      }
    }
    else if (args.platform !== undefined) {
      starter = resolveStarter(args.platform)
      if (!starter) {
        logger.error(`Unknown platform or starter "${args.platform}". Use ${choices}.`)
        return process.exit(1)
      }
    }
    else {
      starter = process.stdin.isTTY
        ? await consola.prompt('What do you want to build?', {
          type: 'select',
          options: (Object.keys(STARTERS) as Starter[]).map(value => ({
            value,
            label: `${STARTERS[value].platforms.join(' + ')} (${value})`,
            hint: STARTERS[value].hint,
          })),
          initial: 'workspace',
          cancel: 'reject',
        }) as Starter
        : 'workspace'
    }

    if (!args.force && !(await isEmptyDir(dir))) {
      logger.error(`${dir} is not empty. Pick another directory or pass --force.`)
      return process.exit(1)
    }

    const label = starter ? `the ${starter} starter` : args.template
    await downloadTemplateToDir({
      template: starter ? repoSource(`.starters/${starter}`, args.ref) : args.template!,
      path: dir,
      force: args.force,
    }).catch((error) => {
      logger.error(`Failed to download ${label}`)
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })
    if (hasPackage(dir))
      await renamePackage(dir, toPackageName(basename(dir)))
    logger.success(`Created ${label} in ${dir}`)

    const hasPrepareEnv = !!(await readPackage(dir))?.scripts?.['prepare:env']
    if (args.install && hasPackage(dir)) {
      logger.start('Installing dependencies')
      await installDeps(dir)
      if (hasPrepareEnv)
        await runPackageScript('prepare:env', dir)
    }

    const cd = relative(args.cwd, dir) || '.'
    logger.box([
      'Next steps:',
      cd === '.' ? undefined : `  cd ${cd}`,
      args.install ? undefined : `  pnpm install${hasPrepareEnv ? ' && pnpm prepare:env' : ''}`,
      ...(!starter
        ? []
        : starter === 'mobile'
          ? ['  set NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER (and _API_BASE) in apps/mobile/.env']
          : ['  put your email in NUXT_ACL_ADMINS in apps/web/.env']),
      '  pnpm dev',
    ].filter(Boolean).join('\n'))
  },
})
