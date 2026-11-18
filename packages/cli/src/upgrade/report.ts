import { relative } from 'node:path'
import type { Bump } from './manifests.ts'
import type { Hit, MigrationResult } from './migrate.ts'

export interface UpgradeSummary {
  root: string
  from: Record<string, string>
  to: Record<string, string>
  bumps: Bump[]
  results: MigrationResult[]
  dryRun: boolean
}

const code = (text: string) => `\`${text.replace(/`/g, '\'')}\``

/** The upgrade as a Markdown checklist: what changed, what a person still has to do, and the commands to run next. */
export const renderReport = ({ root, from, to, bumps, results, dryRun }: UpgradeSummary) => {
  const at = (hit: Hit) => `${relative(root, hit.file)}:${hit.line}`
  const lines: string[] = [`# @frigear-nu upgrade${dryRun ? ' (dry run)' : ''}`, '']

  const names = Object.keys(to).filter(name => from[name] && from[name] !== to[name]).sort()
  if (!names.length) return [...lines, 'Every `@frigear-nu/*` package is already at its target version.', ''].join('\n')

  lines.push('| Package | From | To |', '| --- | --- | --- |', ...names.map(name => `| ${name} | ${from[name]} | ${to[name]} |`), '')
  const files = [...new Set(bumps.map(bump => relative(root, bump.file)))]
  lines.push(`${dryRun ? 'Would update' : 'Updated'} ${bumps.length} version pins in ${files.map(code).join(', ')}.`, '')

  const applied = results.filter(result => result.applied.length || result.project.applied.length)
  if (applied.length) {
    lines.push(`## ${dryRun ? 'Would be rewritten' : 'Rewritten'}`, '')
    for (const { migration, applied: hits, project } of applied) {
      lines.push(`### ${migration.title}`, '', `${migration.package}@${migration.since} · [docs](${migration.docs})`, '')
      for (const hit of hits) lines.push(`- ${code(at(hit))} ${hit.message}`)
      for (const message of project.applied) lines.push(`- ${message}`)
      lines.push('')
    }
  }

  const manual = results.filter(result => result.manual.length || result.project.manual.length || result.migration.steps?.length)
  if (manual.length) {
    lines.push('## To do by hand', '')
    for (const { migration, manual: hits, project } of manual) {
      lines.push(`### ${migration.title}`, '', `${migration.package}@${migration.since} · [docs](${migration.docs})`, '')
      for (const hit of hits) lines.push(`- [ ] ${code(at(hit))} ${code(hit.text)}: ${hit.message}`)
      for (const message of project.manual) lines.push(`- [ ] ${message}`)
      for (const step of migration.steps ?? []) lines.push(`- [ ] ${step}`)
      lines.push('')
    }
  }

  const schema = results.some(result => result.migration.schema)
  lines.push(
    '## Next',
    '',
    '1. `pnpm install`',
    schema
      ? '2. Generate a migration in every app with a database (`pnpm db:generate`, or `nuxt db generate`) and commit it: these releases changed the schema.'
      : '2. Generate a migration in every app with a database (`pnpm db:generate`) if it prints changes, and commit it.',
    '3. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Stale `.nuxt` types cause false errors: run `nuxt prepare` first.',
    '',
  )
  return lines.join('\n')
}
