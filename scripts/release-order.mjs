#!/usr/bin/env node
// Prints the releasable packages (folder names under packages/) as a JSON array in dependency order: each package
// after the workspace packages in its `dependencies` and `peerDependencies`, ties broken by folder name. Private
// packages are skipped. Zero dependencies; run from the repo root (the Release workflow's `prepare` job calls it).
//
//   node scripts/release-order.mjs [selection]
//
// selection:
//   all (default)   every releasable package
//   changed         packages with commits under their folder since their last release tag (the tag of the version
//                   in their package.json, `tagName` in .release-it.json, e.g. `cli@0.2.4`); a missing tag counts
//                   as changed. Needs the tags, so check out with `fetch-depth: 0`.
//   a, b c          the named folders, comma or space separated; an unknown name fails
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const packagesDir = join(root, 'packages')

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function fail(message) {
  console.error(`release-order: ${message}`)
  process.exit(1)
}

/** @type {Map<string, { dir: string, name: string, version: string, deps: string[] }>} */
const packages = new Map()
const dirByName = new Map()
for (const dir of readdirSync(packagesDir).sort()) {
  const file = join(packagesDir, dir, 'package.json')
  if (!existsSync(file)) continue
  const pkg = readJson(file)
  if (pkg.private) continue
  packages.set(dir, {
    dir,
    name: pkg.name,
    version: pkg.version,
    deps: [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})],
  })
  dirByName.set(pkg.name, dir)
}

// Kahn's algorithm, always taking the alphabetically first package whose workspace dependencies are placed.
const needs = new Map()
for (const pkg of packages.values()) {
  needs.set(pkg.dir, new Set(pkg.deps.map(d => dirByName.get(d)).filter(d => d && d !== pkg.dir)))
}
const order = []
while (needs.size) {
  const ready = [...needs].filter(([, deps]) => deps.size === 0).map(([dir]) => dir).sort()
  if (!ready.length) fail(`dependency cycle between ${[...needs.keys()].join(', ')}`)
  const next = ready[0]
  order.push(next)
  needs.delete(next)
  for (const deps of needs.values()) deps.delete(next)
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function releaseTag(pkg) {
  const config = join(packagesDir, pkg.dir, '.release-it.json')
  const tagName = existsSync(config) ? readJson(config).git?.tagName : undefined
  return (tagName ?? `${pkg.dir}@\${version}`).replaceAll('${version}', pkg.version)
}

function hasChanged(pkg) {
  const tag = releaseTag(pkg)
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])
  }
  catch {
    return true
  }
  return git(['log', '--format=%H', '-1', `${tag}..HEAD`, '--', `packages/${pkg.dir}`]) !== ''
}

const selection = process.argv.slice(2).join(' ').trim() || 'all'
let selected
if (selection === 'all') {
  selected = order
}
else if (selection === 'changed') {
  selected = order.filter(dir => hasChanged(packages.get(dir)))
}
else {
  const wanted = new Set(selection.split(/[\s,]+/).filter(Boolean))
  const unknown = [...wanted].filter(dir => !packages.has(dir))
  if (unknown.length) fail(`unknown packages: ${unknown.join(', ')} (folder names under packages/, not private)`)
  selected = order.filter(dir => wanted.has(dir))
}

console.log(JSON.stringify(selected))
