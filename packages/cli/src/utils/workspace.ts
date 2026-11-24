import { kebabCase } from 'scule'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { findNearestFile, readPackageJSON, writePackageJSON } from 'pkg-types'
import { PlatformError } from '../platform/errors.ts'
import { workspaceGlobs } from '../upgrade/manifests.ts'

/** The nearest directory above `cwd` (inclusive) with a `pnpm-workspace.yaml`, or `undefined`. */
export const findWorkspaceRoot = async (cwd: string) => {
  const file = await findNearestFile('pnpm-workspace.yaml', { startingFrom: cwd }).catch(() => undefined)
  return file ? dirname(file) : undefined
}

export const readPackage = async (dir: string) => {
  const path = join(dir, 'package.json')
  return existsSync(path) ? readPackageJSON(path) : undefined
}

export const hasPackage = (dir: string) => existsSync(join(dir, 'package.json'))

/** Sets the `name` of the package in `dir`, keeping every other field. */
export const renamePackage = async (dir: string, name: string) => {
  const path = join(dir, 'package.json')
  const pkg = await readPackageJSON(path)
  await writePackageJSON(path, { ...pkg, name })
}

/** `@scope` of a package name, or `undefined` for an unscoped name. */
export const packageScope = (name?: string) => name?.startsWith('@') ? name.split('/')[0] : undefined

/** Directories directly under `dir` (empty if it does not exist). */
export const listDirs = async (dir: string) => {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter(entry => entry.isDirectory()).map(entry => join(dir, entry.name))
}

/** Whether `dir` is missing or empty. */
export const isEmptyDir = async (dir: string) => !existsSync(dir) || (await readdir(dir)).length === 0

/** A package or folder name from free text: `My App` → `my-app`. */
export const toPackageName = (name: string) =>
  kebabCase(name.replace(/[^\w-]+/g, '-')).replace(/-+/g, '-').replace(/^-|-$/g, '')

/** Whether `path` is `dir` or inside it. */
export const isInside = (path: string, dir: string) => {
  const rel = relative(dir, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Parent folders of the workspace's one-level package globs (`apps/*` → `apps`), `packages` left out. */
export const appGlobDirs = async (root: string) => {
  const yamlPath = join(root, 'pnpm-workspace.yaml')
  const globs = existsSync(yamlPath) ? workspaceGlobs(await readFile(yamlPath, 'utf-8')) : []
  return [...new Set(globs
    .map(glob => glob.replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(glob => /^[^*]+\/\*{1,2}$/.test(glob))
    .map(glob => glob.replace(/\/\*{1,2}$/, ''))
    .filter(dir => dir !== 'packages'))]
}

export interface AppsDir {
  /** Absolute path of the folder new apps go into. */
  dir: string
  /** Whether a `pnpm-workspace.yaml` glob covers its subfolders; if not, pnpm will not install an app put there. */
  covered: boolean
}

/**
 * The folder apps live in. `appsDir` (resolved against `cwd`) when given and not `auto`; else the apps folder `cwd` is
 * in (so the command works from the root and from inside `apps/`); else `apps`, or the first other folder of a
 * one-level `pnpm-workspace.yaml` glob that is not `packages`.
 */
export const resolveAppsDir = async ({ cwd, root, appsDir }: { cwd: string, root: string, appsDir?: string }): Promise<AppsDir> => {
  const globDirs = await appGlobDirs(root)
  const covered = (dir: string) => globDirs.some(globDir => resolve(root, globDir) === dir)
  if (appsDir && appsDir !== 'auto') {
    const dir = resolve(cwd, appsDir)
    if (!isInside(dir, root) || dir === root)
      throw new PlatformError('OUTSIDE_ROOT', `${dir} is not a folder inside the workspace at ${root}`)
    return { dir, covered: covered(dir) }
  }
  const current = globDirs.map(globDir => resolve(root, globDir)).find(dir => isInside(resolve(cwd), dir))
  if (current) return { dir: current, covered: true }
  const fallback = globDirs.includes('apps') ? 'apps' : globDirs[0] ?? 'apps'
  const dir = resolve(root, fallback)
  return { dir, covered: covered(dir) }
}
