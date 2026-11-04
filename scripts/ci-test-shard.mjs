#!/usr/bin/env node
// Runs one shard of the workspace's Vitest files (CI's `test` matrix, see .github/workflows/ci.yml).
//
//   node scripts/ci-test-shard.mjs <index> <total> [--affected] [--print]
//
// Most test time is @nuxt/test-utils e2e files, each building and booting a Nuxt fixture (15-130 s). Vitest's own
// `--shard` splits every package separately, which piles all single-file packages into one shard, so this script
// balances test *files* across shards globally, weighted by scripts/ci-test-timings.json (seconds per file, measured
// on CI; refresh it from the summary this script prints). Then it runs its shard's files, two packages at a time:
// the runner has 2 vCPU and a Nuxt fixture build keeps one core busy.
//
//   --affected  only packages Turbo considers affected (changed + dependents; TURBO_SCM_BASE / TURBO_SCM_HEAD)
//   --print     print the assignment and exit; `all` as <index> prints every shard
//
// Zero dependencies: runs right after `pnpm install`.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const [indexArg, totalArg] = args.filter(a => !a.startsWith('--'))
const total = Number(totalArg)
const index = indexArg === 'all' ? 'all' : Number(indexArg)
if (!Number.isInteger(total) || total < 1 || (index !== 'all' && !(Number.isInteger(index) && index >= 1 && index <= total))) {
  console.error('usage: node scripts/ci-test-shard.mjs <index|all> <total> [--affected] [--print]')
  process.exit(2)
}
const PARALLEL = 2
// Weight of a file without a measurement: one that boots a Nuxt fixture is expensive, anything else is cheap.
async function defaultWeight(absFile) {
  const source = await readFile(absFile, 'utf8').catch(() => '')
  return /@nuxt\/test-utils\/e2e/.test(source) ? 45 : 2
}

function run(cmd, cmdArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', ...options })
    let out = ''
    child.stdout?.on('data', (d) => { out += d })
    child.on('error', reject)
    child.on('close', code => resolve({ code, out }))
  })
}

async function capture(cmd, cmdArgs) {
  const { code, out } = await run(cmd, cmdArgs, { capture: true })
  if (code !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} exited with ${code}`)
  return out
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }))
  return results
}

// 1. Packages with a `test` script (affected ones with --affected).
const ls = JSON.parse(await capture('pnpm', ['exec', 'turbo', 'ls', '--output=json', ...(flags.has('--affected') ? ['--affected'] : [])]))
const packages = (await Promise.all(ls.packages.items.map(async ({ name, path }) => {
  const pkg = JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8'))
  return pkg.scripts?.test ? { name, path } : null
}))).filter(Boolean)

// 2. Their test files, as each package's own Vitest config sees them.
const timings = JSON.parse(await readFile(join(root, 'scripts/ci-test-timings.json'), 'utf8'))
const files = (await mapLimit(packages, 4, async ({ name, path }) => {
  const listed = JSON.parse(await capture('pnpm', ['--filter', name, 'exec', 'vitest', 'list', '--filesOnly', '--json']))
  return Promise.all([...new Set(listed.map(t => t.file))].map(async (abs) => {
    const file = relative(join(root, path), abs)
    return { pkg: name, path, file, weight: timings[name]?.[file] ?? await defaultWeight(abs) }
  }))
})).flat()

// 3. Greedy: heaviest file first, into the lightest shard.
const shards = Array.from({ length: total }, () => ({ weight: 0, files: [] }))
for (const f of files.toSorted((a, b) => b.weight - a.weight || a.pkg.localeCompare(b.pkg) || a.file.localeCompare(b.file))) {
  const lightest = shards.reduce((min, s) => (s.weight < min.weight ? s : min))
  lightest.files.push(f)
  lightest.weight += f.weight
}

function groupByPackage(shardFiles) {
  const byPkg = new Map()
  for (const f of shardFiles) {
    const group = byPkg.get(f.pkg) ?? { pkg: f.pkg, path: f.path, weight: 0, files: [] }
    group.files.push(f.file)
    group.weight += f.weight
    byPkg.set(f.pkg, group)
  }
  return [...byPkg.values()].sort((a, b) => b.weight - a.weight)
}

if (flags.has('--print')) {
  console.log(`${files.length} test files in ${packages.length} packages, ${total} shards`)
  shards.forEach((s, i) => {
    if (index !== 'all' && index !== i + 1) return
    console.log(`\nshard ${i + 1}/${total}: ${s.files.length} files, ~${s.weight}s of measured time`)
    for (const g of groupByPackage(s.files)) console.log(`  ${g.pkg} (~${g.weight}s): ${g.files.join(' ')}`)
  })
  process.exit(0)
}
if (index === 'all') {
  console.error('`all` only works with --print')
  process.exit(2)
}

// 4. Run this shard, PARALLEL packages at a time, heaviest first.
const groups = groupByPackage(shards[index - 1].files)
if (groups.length === 0) {
  console.log(`shard ${index}/${total}: nothing to test`)
  process.exit(0)
}
const ci = Boolean(process.env.GITHUB_ACTIONS)
console.log(`shard ${index}/${total}: ${groups.reduce((n, g) => n + g.files.length, 0)} files in ${groups.length} packages`)

const results = await mapLimit(groups, PARALLEL, async (g) => {
  const started = Date.now()
  // Buffer each package's output so parallel packages don't interleave; print it as one (collapsible) block.
  const { code, out } = await run('pnpm', [
    '--filter', g.pkg, 'exec', 'vitest', 'run', ...g.files,
  ], { capture: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } })
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(`${ci ? '::group::' : '\n== '}${g.pkg} (${seconds}s, ${code === 0 ? 'passed' : 'FAILED'})`)
  process.stdout.write(out)
  if (ci) console.log('::endgroup::')
  if (code !== 0 && ci) console.log(`::error::${g.pkg} tests failed`)
  // The default reporter's per-file line ("✓ test/x.test.ts (3 tests) 41896ms") includes the fixture boot, which
  // happens while collecting; the JSON reporter's file times leave it out.
  const fileTimes = {}
  for (const m of out.replace(/\x1B\[[0-9;]*m/g, '').matchAll(/^\s*[✓❯×]\s+(?:\S+\s+)??(test\/\S+\.ts)\s+\([^)]*\)\s+(\d+)ms/gm)) {
    fileTimes[m[1]] = Math.max(1, Math.round(Number(m[2]) / 1000))
  }
  return { pkg: g.pkg, code, seconds, fileTimes }
})

// 5. Summary: measured seconds per file, in the shape of scripts/ci-test-timings.json.
console.log(`\nMeasured file times (merge into scripts/ci-test-timings.json to rebalance):`)
console.log(JSON.stringify(Object.fromEntries(results.map(r => [r.pkg, r.fileTimes])), null, 2))
const failed = results.filter(r => r.code !== 0)
if (failed.length) {
  console.error(`\nFailed: ${failed.map(r => r.pkg).join(', ')}`)
  process.exit(1)
}
