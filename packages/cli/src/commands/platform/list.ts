import { defineCommand } from 'citty'
import consola from 'consola'
import { relative } from 'node:path'
import { platformRegistry } from '../../platform/define.ts'
import { listWorkspaceApps } from '../../platform/init.ts'
import { defineCommandArgs } from '../../utils/args.ts'
import { findWorkspaceRoot, readPackage, resolveAppsDir } from '../../utils/workspace.ts'
import { appsDirArg, exitWith } from './shared.ts'

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List the platforms, templates and targets, and the workspace\'s apps per platform',
  },
  args: defineCommandArgs({ ...appsDirArg }),
  async run({ args }) {
    const logger = consola.withTag('platform list')
    const root = await findWorkspaceRoot(args.cwd)
    const registry = platformRegistry(root ? await readPackage(root) : undefined)

    const lines = ['Platforms:']
    for (const platform of Object.values(registry.platforms)) {
      const targets = Object.keys(platform.targets ?? {})
      lines.push(`  ${platform.name}${platform.template ? ` (template ${platform.template})` : ''}${platform.description ? `: ${platform.description}` : ''}`)
      if (targets.length) lines.push(`    targets: ${targets.join(', ')}`)
    }
    lines.push('', `Templates: ${Object.keys(registry.templates).join(', ')}, or any giget source`)

    if (root) {
      const appsDir = await resolveAppsDir({ cwd: args.cwd, root, appsDir: args['apps-dir'] }).catch(error => exitWith(logger, error))
      const apps = await listWorkspaceApps(appsDir.dir, registry)
      lines.push('', `Apps in ${relative(root, appsDir.dir) || '.'}:`)
      for (const app of apps) lines.push(`  ${app.name}: ${app.platform?.name ?? 'unknown platform'}`)
      if (!apps.length) lines.push('  none yet')
    }
    logger.log(lines.join('\n'))
  },
})
