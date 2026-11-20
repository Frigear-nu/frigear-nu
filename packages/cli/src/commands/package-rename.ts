import { defineCommand } from 'citty'
import consola from 'consola'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { workspacePackageDirs } from '../upgrade/manifests.ts'
import { defineCommandArgs } from '../utils/args.ts'
import { applyPlan, planChanges, printPlan, resolveArg, toPosix } from '../utils/refactor.ts'
import type { Move } from '../utils/refactor.ts'
import { findWorkspaceRoot, packageScope, readPackage } from '../utils/workspace.ts'

const VALID_NAME = /^(?:@[a-z0-9-~][\w.~-]*\/)?[a-z0-9-~][\w.~-]*$/
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'peerDependenciesMeta']

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** The new package name: a bare name gets the old name's scope (`forms` → `@acme/forms` for `@acme/old`). */
export const resolveNewPackageName = (oldName: string, newName: string) => {
  const scope = packageScope(oldName)
  return newName.startsWith('@') || !scope ? newName : `${scope}/${newName}`
}

/** The workspace package `ref` names: its `name`, or its folder (relative to `cwd` or the root). */
export const findWorkspacePackage = async (root: string, cwd: string, ref: string) => {
  const dirs = await workspacePackageDirs(root)
  for (const dir of dirs) {
    if ((await readPackage(dir))?.name === ref) return { dir, name: ref }
  }
  for (const dir of [resolveArg(cwd, ref), resolveArg(root, ref)]) {
    const name = (await readPackage(dir))?.name
    if (name) return { dir, name }
  }
  return undefined
}

/** A package.json with `oldName` renamed: its own `name` (when it is that package) and keys of its dependency sections. */
export const renameInManifest = (text: string, oldName: string, newName: string) => {
  const name = escape(oldName)
  let out = text.replace(new RegExp(`^(\\s*"name"\\s*:\\s*")${name}(")`, 'm'), `$1${newName}$2`)
  for (const section of DEP_SECTIONS) {
    const block = new RegExp(`("${section}"\\s*:\\s*\\{)((?:[^{}]|\\{[^{}]*\\})*)(\\})`, 'g')
    out = out.replace(block, (_all, head: string, body: string, tail: string) =>
      `${head}${body.replace(new RegExp(`"${name}"(\\s*:)`, 'g'), `"${newName}"$1`)}${tail}`)
  }
  return out
}

/** A pnpm-workspace.yaml with `oldName` renamed in keys (`catalog`, `overrides`, ...) and list items (`- 'name@1.0.0'`). */
export const renameInWorkspaceYaml = (text: string, oldName: string, newName: string) => {
  const name = escape(oldName)
  const key = new RegExp(`^(\\s+)(['"]?)${name}\\2(\\s*:)`)
  const item = new RegExp(`^(\\s*-\\s*)(['"]?)${name}((?:@[^'"\\s#]*)?)\\2(?=\\s|$)`)
  return text.split('\n').map(line => line
    .replace(key, `$1$2${newName}$2$3`)
    .replace(item, `$1$2${newName}$3$2`)).join('\n')
}

/**
 * Source text with references to `oldName` renamed. A scoped name is replaced in every string literal equal to it or
 * starting with `<name>/` (imports, `import()`, nuxt.config `modules`, tsconfig `paths`, Markdown code spans). An
 * unscoped name is too common a word for that, so only import, export and `require` specifiers change.
 */
export const renameInSource = (text: string, oldName: string, newName: string) => {
  const name = escape(oldName)
  if (oldName.startsWith('@')) {
    return text.replace(new RegExp(`(['"\`])${name}(?=\\1|/)`, 'g'), `$1${newName}`)
  }
  return text.replace(
    new RegExp(`(\\b(?:from|import|require)\\s*\\(?\\s*)(['"])${name}(?=\\2|/)`, 'g'),
    `$1$2${newName}`,
  )
}

/** Markdown with every mention of a scoped name renamed, in prose and code alike (`@acme/old/api` too, `@acme/older` not). */
export const renameInMarkdown = (text: string, oldName: string, newName: string) =>
  text.replace(new RegExp(`(?<![\\w@/.-])${escape(oldName)}(?![\\w.-])`, 'g'), newName)

/** Renames `oldName` in one file, picking the rules by file type. */
export const renameReferences = (file: string, text: string, oldName: string, newName: string) => {
  const name = basename(file)
  if (name === 'package.json') return renameInManifest(text, oldName, newName)
  if (name === 'pnpm-workspace.yaml') return renameInWorkspaceYaml(text, oldName, newName)
  if (file.endsWith('.md') && oldName.startsWith('@')) return renameInMarkdown(text, oldName, newName)
  return renameInSource(text, oldName, newName)
}

export interface PackageRenameOptions {
  cwd: string
  package: string
  name: string
  /** Also rename the folder to the new unscoped name. */
  dir?: boolean
}

/** Plans the rename of a workspace package. Throws when the package is unknown or the new name is taken. */
export const planPackageRename = async (options: PackageRenameOptions) => {
  const root = await findWorkspaceRoot(options.cwd)
  if (!root) throw new Error(`No pnpm-workspace.yaml found above ${options.cwd}`)
  const found = await findWorkspacePackage(root, options.cwd, options.package)
  if (!found) throw new Error(`No workspace package named or at ${options.package}`)

  const oldName = found.name
  const newName = resolveNewPackageName(oldName, options.name)
  if (!VALID_NAME.test(newName)) throw new Error(`${newName} is not a valid package name`)
  if (newName === oldName) throw new Error(`${oldName} already has that name`)
  for (const dir of await workspacePackageDirs(root)) {
    if ((await readPackage(dir))?.name === newName) throw new Error(`${toPosix(relative(root, dir)) || '.'} is already named ${newName}`)
  }

  const moves: Move[] = []
  if (options.dir) {
    if (found.dir === root) throw new Error('--dir cannot move the workspace root')
    const to = join(dirname(found.dir), newName.split('/').pop()!)
    if (to !== found.dir) {
      if (existsSync(to)) throw new Error(`${toPosix(relative(root, to))} already exists`)
      moves.push({ from: found.dir, to, kind: 'dir' })
    }
  }

  const yaml = join(root, 'pnpm-workspace.yaml')
  const plan = await planChanges(root, moves, (file, text) => renameReferences(file, text, oldName, newName))
  // pnpm-workspace.yaml is not a source file, so the scan above skipped it
  const yamlText = await readFile(yaml, 'utf-8')
  const renamed = renameInWorkspaceYaml(yamlText, oldName, newName)
  if (renamed !== yamlText) plan.writes.set(yaml, renamed)
  if (!oldName.startsWith('@')) {
    plan.warnings.push(`${oldName} is unscoped, so only manifests and import specifiers were renamed: search the workspace for other uses.`)
  }
  return { plan, oldName, newName, dir: found.dir }
}

export default defineCommand({
  meta: {
    name: 'package:rename',
    description: 'Rename a workspace package and every reference to it',
  },
  args: defineCommandArgs({
    package: {
      type: 'positional',
      description: 'The package: its current name or its folder',
      required: true,
    },
    name: {
      type: 'positional',
      description: 'New name; a bare name keeps the old scope (forms → @acme/forms)',
      required: true,
    },
    dir: {
      type: 'boolean',
      description: 'Also rename the folder to the new unscoped name',
      default: false,
    },
    dryRun: {
      type: 'boolean',
      description: 'Print what would change; write nothing',
      default: false,
    },
  }),
  async run({ args }) {
    const logger = consola.withTag('package:rename')
    const result = await planPackageRename({ cwd: resolveArg(process.cwd(), args.cwd), package: args.package, name: args.name, dir: args.dir })
      .catch((error) => {
        logger.error(error instanceof Error ? error.message : error)
        return process.exit(1)
      })
    if (!args.dryRun) await applyPlan(result.plan)
    logger.success(`${args.dryRun ? 'Would rename' : 'Renamed'} ${result.oldName} → ${result.newName}`)
    printPlan(result.plan, 'package:rename', {
      dryRun: args.dryRun,
      next: [
        '`pnpm install` to update pnpm-lock.yaml and the node_modules links (lockfiles were not edited)',
        '`nuxi prepare` (or restart `nuxi dev`) in the apps that use it, so .nuxt types pick up the new name',
      ],
    })
  },
})
