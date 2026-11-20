import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { compareVersions, parseVersion, rewriteRange } from './versions.ts'

export const SCOPE = '@frigear-nu/'

/** A version pin of a `@frigear-nu/*` package somewhere in the workspace. */
export interface Pin {
  /** File, relative to the workspace root. */
  file: string
  name: string
  range: string
}

/** A rewritten pin. */
export interface Bump extends Pin {
  next: string
}

/** Lines of `pnpm-workspace.yaml` naming a scoped package: `'@frigear-nu/auth': ^0.6.0` and `- '@frigear-nu/auth@0.6.0'`. */
const YAML_KEY = /^(\s*)(['"]?)(@frigear-nu\/[\w.-]+)\2(\s*:\s*)(['"]?)([^'"\s#]+)\5/
const YAML_ITEM = /^(\s*-\s*)(['"]?)(@frigear-nu\/[\w.-]+)@([^'"\s#]+)\2/
/** `"@frigear-nu/auth": "0.3.4"` in a package.json. */
const JSON_ENTRY = /("(@frigear-nu\/[\w.-]+)"\s*:\s*")([^"]*)(")/g

const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.data', '.git', 'dist', 'coverage', '.turbo', '.vercel', '.wrangler'])

/** The `packages:` globs of a `pnpm-workspace.yaml` (negations dropped). */
export const workspaceGlobs = (yaml: string) => {
  const globs: string[] = []
  let inPackages = false
  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) inPackages = /^packages\s*:/.test(line)
    else if (inPackages) {
      const item = line.match(/^\s*-\s*['"]?([^'"#\s]+)/)
      if (item && !item[1]!.startsWith('!')) globs.push(item[1]!.trim())
    }
  }
  return globs
}

const subdirs = async (dir: string) => existsSync(dir)
  ? (await readdir(dir, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
      .map(entry => join(dir, entry.name))
  : []

const deepDirs = async (dir: string): Promise<string[]> => {
  const children = await subdirs(dir)
  return [dir, ...(await Promise.all(children.map(deepDirs))).flat()]
}

/** Directories of the workspace's packages (the root first), from `packages:` globs like `apps/*` and `packages/**`. */
export const workspacePackageDirs = async (root: string) => {
  const yamlPath = join(root, 'pnpm-workspace.yaml')
  const globs = existsSync(yamlPath) ? workspaceGlobs(await readFile(yamlPath, 'utf-8')) : []
  const dirs = new Set([root])
  for (const glob of globs) {
    const parts = glob.replace(/\/+$/, '').split('/')
    let current = [root]
    for (const part of parts) {
      if (part === '**') current = (await Promise.all(current.map(deepDirs))).flat()
      else if (part.includes('*')) {
        const pattern = new RegExp(`^${part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
        current = (await Promise.all(current.map(subdirs))).flat().filter(dir => pattern.test(dir.split(/[\\/]/).pop()!))
      }
      else current = current.map(dir => join(dir, part))
    }
    for (const dir of current) if (existsSync(join(dir, 'package.json'))) dirs.add(dir)
  }
  return [...dirs]
}

/** The manifest files that may pin versions: every package.json of the workspace and its `pnpm-workspace.yaml`. */
export const manifestFiles = async (root: string) => {
  const files = (await workspacePackageDirs(root)).map(dir => join(dir, 'package.json')).filter(existsSync)
  const yaml = join(root, 'pnpm-workspace.yaml')
  return existsSync(yaml) ? [...files, yaml] : files
}

/** Every `@frigear-nu/*` pin in a manifest's text. */
export const findPins = (file: string, text: string): Pin[] => {
  if (file.endsWith('.json')) {
    return [...text.matchAll(JSON_ENTRY)].map(match => ({ file, name: match[2]!, range: match[3]! }))
  }
  return text.split('\n').flatMap((line) => {
    const key = line.match(YAML_KEY)
    if (key) return [{ file, name: key[3]!, range: key[6]! }]
    const item = line.match(YAML_ITEM)
    return item ? [{ file, name: item[3]!, range: item[4]! }] : []
  })
}

/**
 * The manifest text with each pin of a package in `targets` moved to its target version (keeping the range operator),
 * and the bumps made. Pins that are not plain versions (`workspace:*`, `catalog:`, `false` in `allowBuilds`) stay.
 */
export const rewritePins = (file: string, text: string, targets: Record<string, string>) => {
  const bumps: Bump[] = []
  const bump = (name: string, range: string) => {
    const target = targets[name]
    const next = target ? rewriteRange(range, target) : undefined
    if (next) bumps.push({ file, name, range, next })
    return next
  }

  if (file.endsWith('.json')) {
    const out = text.replace(JSON_ENTRY, (all, head: string, name: string, range: string, tail: string) => {
      const next = bump(name, range)
      return next ? `${head}${next}${tail}` : all
    })
    return { text: out, bumps }
  }

  const out = text.split('\n').map((line) => {
    const key = line.match(YAML_KEY)
    if (key) {
      const [all, indent, q, name, sep, vq, range] = key
      const next = bump(name!, range!)
      return next ? line.replace(all, `${indent}${q}${name}${q}${sep}${vq}${next}${vq}`) : line
    }
    const item = line.match(YAML_ITEM)
    if (item) {
      const [all, dash, q, name, range] = item
      const next = bump(name!, range!)
      return next ? line.replace(all, `${dash}${q}${name}@${next}${q}`) : line
    }
    return line
  }).join('\n')
  return { text: out, bumps }
}

/** Per package, the lowest version any pin names: what the workspace is upgrading from. */
export const currentVersions = (pins: Pin[]) => {
  const versions: Record<string, string> = {}
  for (const pin of pins) {
    const version = parseVersion(pin.range)
    if (!version) continue
    const value = `${version[0]}.${version[1]}.${version[2]}${version[3] ? `-${version[3]}` : ''}`
    const known = versions[pin.name]
    if (!known || compareVersions(value, known) < 0) versions[pin.name] = value
  }
  return versions
}

/** Pins with `file` made relative to `root`, for messages. */
export const relativeFile = (root: string, file: string) => relative(root, file) || file

/** `@frigear-nu/*` packages a `pnpm-lock.yaml` holds in more than one version, with those versions (sorted). */
export const duplicateVersions = (lock: string) => {
  const found = new Map<string, Set<string>>()
  for (const match of lock.matchAll(/^ {2}'?(@frigear-nu\/[\w.-]+)@(\d[^'(:\s]*)/gm)) {
    const versions = found.get(match[1]!) ?? new Set()
    found.set(match[1]!, versions.add(match[2]!))
  }
  return Object.fromEntries([...found]
    .filter(([, versions]) => versions.size > 1)
    .map(([name, versions]) => [name, [...versions].sort(compareVersions)]))
}

/** Libraries the modules share with the app: two copies of one major break the build output or shared state. */
export const SHARED_LIBRARIES = ['zod', 'h3', 'vue', 'vue-router', 'drizzle-orm', '@nuxt/kit']

/**
 * `{ zod: ['4.6.5', '4.6.7'] }` for every shared library installed in more than one version of the same major in a
 * pnpm lockfile. (zod 3 next to zod 4 is fine: different majors are separate on purpose.)
 */
export const sharedDuplicates = (lock: string, names = SHARED_LIBRARIES) => {
  const found = new Map<string, Set<string>>()
  for (const match of lock.matchAll(/^ {2}'?((?:@[\w.-]+\/)?[\w.-]+)@(\d[^'(:\s]*)/gm)) {
    if (!names.includes(match[1]!)) continue
    const versions = found.get(match[1]!) ?? new Set()
    found.set(match[1]!, versions.add(match[2]!))
  }
  const duplicates: Record<string, string[]> = {}
  for (const [name, versions] of found) {
    const byMajor = new Map<string, string[]>()
    for (const version of versions) {
      const major = version.split('.')[0]!
      byMajor.set(major, [...(byMajor.get(major) ?? []), version])
    }
    for (const same of byMajor.values()) {
      if (same.length > 1) duplicates[name] = [...(duplicates[name] ?? []), ...same.sort(compareVersions)]
    }
  }
  return duplicates
}
