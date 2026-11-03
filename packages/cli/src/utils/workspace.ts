import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { findNearestFile, readPackageJSON, writePackageJSON } from 'pkg-types'

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
