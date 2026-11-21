import { defineCommand } from 'citty'
import consola from 'consola'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { migrations as allMigrations } from '../upgrades/index.ts'
import { currentVersions, duplicateVersions, findPins, manifestFiles, movePatchedDependencies, rewritePins, sharedDuplicates, type PatchMove, type Bump, type Pin } from '../upgrade/manifests.ts'
import { pendingMigrations, runMigrations, sourceFiles, type Migration } from '../upgrade/migrate.ts'
import { latestVersion, parseTargets } from '../upgrade/registry.ts'
import { renderReport } from '../upgrade/report.ts'
import { compareVersions } from '../upgrade/versions.ts'
import { defineCommandArgs } from '../utils/args.ts'
import { installDeps } from '../utils/install.ts'
import { findWorkspaceRoot } from '../utils/workspace.ts'

export interface UpgradeOptions {
  /** Any directory of the workspace; the root is found from it. */
  cwd: string
  /** Target versions per package; packages left out go to their `latest` dist-tag. */
  to?: Record<string, string>
  /** Only these packages (default: every `@frigear-nu/*` package the workspace pins). */
  only?: string[]
  dryRun?: boolean
  /** Resolves a package's latest version (the npm registry by default). */
  resolveLatest?: (name: string) => Promise<string | undefined>
  migrations?: Migration[]
}

/**
 * Moves every `@frigear-nu/*` pin of a workspace (package.json files and `pnpm-workspace.yaml`) to its target version
 * and runs the migrations of the breaking releases in between. Returns what it did, and the report as Markdown.
 */
export const upgradeWorkspace = async (options: UpgradeOptions) => {
  const root = await findWorkspaceRoot(options.cwd) ?? options.cwd
  const dryRun = options.dryRun === true
  const resolveLatest = options.resolveLatest ?? latestVersion

  const manifests = await Promise.all((await manifestFiles(root)).map(async file => ({ file, text: await readFile(file, 'utf-8') })))
  const pins: Pin[] = manifests.flatMap(({ file, text }) => findPins(file, text))
  const from = currentVersions(pins)

  let names = Object.keys(from)
  if (options.only?.length) names = names.filter(name => options.only!.includes(name))

  const to: Record<string, string> = {}
  const skipped: string[] = []
  await Promise.all(names.map(async (name) => {
    const target = options.to?.[name] ?? await resolveLatest(name)
    if (!target) return // not published: a package of the workspace itself
    if (compareVersions(target, from[name]!) < 0) skipped.push(`${name}: pinned ${from[name]} is newer than ${target}`)
    else to[name] = target
  }))

  const bumps: Bump[] = []
  const patches: PatchMove[] = []
  for (const manifest of manifests) {
    const pinned = rewritePins(manifest.file, manifest.text, to)
    const patched = movePatchedDependencies(manifest.file, pinned.text, to)
    bumps.push(...pinned.bumps)
    patches.push(...patched.moves)
    if ((pinned.bumps.length || patched.moves.length) && !dryRun) await writeFile(manifest.file, patched.text, 'utf-8')
  }
  for (const move of patches) {
    const source = join(root, move.patch)
    const target = join(root, move.next)
    if (dryRun || move.next === move.patch || !existsSync(source) || existsSync(target)) continue
    await mkdir(dirname(target), { recursive: true })
    await rename(source, target)
  }

  const pending = pendingMigrations(options.migrations ?? allMigrations, from, to)
  const results = await runMigrations(pending, { root, files: await sourceFiles(root), dryRun })
  const fromUpgraded = Object.fromEntries(Object.keys(to).map(name => [name, from[name]!]))
  let report = renderReport({ root, from: fromUpgraded, to, bumps, results, dryRun })
  if (patches.length) {
    report += [
      '',
      '## Patched packages',
      '',
      `${dryRun ? 'Would move' : 'Moved'} these \`patchedDependencies\` to the new version. Check that each patch still applies (\`pnpm install\` fails if not) and is still needed: the release may already include the change.`,
      '',
      ...patches.map(move => `- \`${move.name}\` ${move.from} → ${move.to}: \`${move.patch}\` → \`${move.next}\` (${relative(root, move.file)})`),
      '',
    ].join('\n')
  }
  return { root, from: fromUpgraded, to, bumps, patches, results, skipped, report }
}

export default defineCommand({
  meta: {
    name: 'upgrade',
    description: 'Upgrade every @frigear-nu package of a workspace and apply the code changes of the releases in between',
  },
  args: defineCommandArgs({
    packages: {
      type: 'positional',
      description: 'Only these packages, e.g. auth users (default: all)',
      required: false,
    },
    to: {
      type: 'string',
      description: 'Target versions instead of latest, e.g. auth@0.6.1,users@3.1.0',
    },
    dryRun: {
      type: 'boolean',
      description: 'Only print the report; change nothing',
      default: false,
    },
    install: {
      type: 'boolean',
      description: 'Run pnpm install afterwards (--no-install to skip)',
      default: true,
    },
    report: {
      type: 'string',
      description: 'Where to write the Markdown report (relative to the workspace root, or absolute)',
      default: 'frigear-upgrade.md',
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('upgrade')
    const only = args._.map(String).filter(Boolean).map(name => name.includes('/') ? name : `@frigear-nu/${name}`)

    const result = await upgradeWorkspace({
      cwd: resolve(args.cwd),
      to: parseTargets(args.to),
      only,
      dryRun: args.dryRun,
    }).catch((error) => {
      logger.error(error instanceof Error ? error.message : error)
      return process.exit(1)
    })

    for (const message of result.skipped) logger.warn(message)
    const upgraded = Object.keys(result.to).filter(name => result.from[name] !== result.to[name])
    if (!upgraded.length) {
      logger.success('Every @frigear-nu package is already at its target version.')
      return
    }

    const manual = result.results.reduce((sum, r) => sum + r.manual.length + r.project.manual.length + (r.migration.steps?.length ?? 0), 0)
    const applied = result.results.reduce((sum, r) => sum + r.applied.length + r.project.applied.length, 0)

    if (args.dryRun) {
      consola.log(result.report)
      return
    }

    const reportPath = resolve(result.root, args.report)
    await writeFile(reportPath, result.report, 'utf-8')
    logger.success(`Upgraded ${upgraded.map(name => `${name} ${result.from[name]} → ${result.to[name]}`).join(', ')}`)
    logger.info(`${result.bumps.length} pins updated, ${applied} code changes made, ${manual} items to do by hand: ${reportPath}`)

    if (args.install) {
      logger.start('Installing')
      try {
        await installDeps(result.root)
      }
      catch (error) {
        logger.warn(`pnpm install failed: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
        logger.info(`Expected while the report still has items that fail the build (\`nuxt prepare\` runs on install). Work through ${reportPath}, then run \`pnpm install\` again.`)
        process.exitCode = 1
        return
      }
      const lock = join(result.root, 'pnpm-lock.yaml')
      const duplicates = existsSync(lock) ? duplicateVersions(await readFile(lock, 'utf-8')) : {}
      for (const [name, versions] of Object.entries(duplicates)) {
        logger.warn(`${name} is installed in ${versions.length} versions (${versions.join(', ')}). Modules share build-time state through one copy. Usually a stale lockfile entry: run \`pnpm dedupe\` (or \`pnpm update -r ${name}\`). If it stays, something pins the old version: raise that range, or add \`'${name}': ^${result.to[name] ?? versions.at(-1)}\` to \`overrides\` in pnpm-workspace.yaml.`)
      }
      const shared = existsSync(lock) ? sharedDuplicates(await readFile(lock, 'utf-8')) : {}
      for (const [name, versions] of Object.entries(shared)) {
        logger.warn(`${name} is installed in ${versions.length} versions of one major (${versions.join(', ')}), usually because an app or package pins it lower than the @frigear-nu modules need. The build output can end up with a broken copy (\`Cannot find module …/node_modules/${name}/…\` at boot): raise that range to \`^${versions.at(-1)}\` and run \`pnpm install\` again, then \`pnpm dedupe\` if a stale lockfile entry keeps the old copy.`)
      }
    }
  },
})
