import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DoctorFinding, DoctorFix } from './doctor'

/** The official rustup installer, unattended (`-y`), with the smallest toolchain that builds Tauri. */
export const RUSTUP_INSTALL = 'curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal'

/** bun.sh's installer, unattended, into `~/.bun` (`$BUN_INSTALL`). */
export const BUN_INSTALL = { unix: 'curl -fsSL https://bun.sh/install | bash', windows: 'powershell -c "irm bun.sh/install.ps1 | iex"' }

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

const LOCKFILES: [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['pnpm-workspace.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

/** The app's package manager: the one running this command, else the lockfile in the app or a parent, else pnpm. */
export function detectPackageManager(cwd: string, userAgent?: string): PackageManager {
  const running = userAgent?.split('/')[0]
  if (running === 'pnpm' || running === 'npm' || running === 'yarn' || running === 'bun') return running
  for (let dir = cwd; ; dir = dirname(dir)) {
    const found = LOCKFILES.find(([file]) => existsSync(join(dir, file)))
    if (found) return found[1]
    if (dirname(dir) === dir) return 'pnpm'
  }
}

/** The command that adds `names` to the app's dependencies (`dev`: devDependencies). */
export function addCommand(pm: PackageManager, names: string[], dev: boolean): [string, string[]] {
  const verb = pm === 'npm' ? 'install' : 'add'
  const flag = dev ? [pm === 'bun' ? '-d' : '-D'] : []
  return [pm, [verb, ...flag, ...names]]
}

/**
 * The fixes of the findings, in the order they run: the Xcode tools, Rust and Bun first, then one install per dependency
 * type, then `init` (which needs the packages to prepare the app).
 */
export function planFixes(findings: DoctorFinding[]): DoctorFix[] {
  const fixes = findings.flatMap(finding => (finding.fix ? [finding.fix] : []))
  const has = (kind: DoctorFix['kind']) => fixes.some(fix => fix.kind === kind)
  const packages = (dev: boolean) => [...new Set(fixes.flatMap(fix => (fix.kind === 'packages' && fix.dev === dev ? fix.names : [])))]
  const plan: DoctorFix[] = []
  if (has('xcode')) plan.push({ kind: 'xcode' })
  if (has('rust')) plan.push({ kind: 'rust' })
  if (has('bun')) plan.push({ kind: 'bun' })
  for (const dev of [true, false]) {
    const names = packages(dev)
    if (names.length) plan.push({ kind: 'packages', names, dev })
  }
  if (has('init')) plan.push({ kind: 'init' })
  return plan
}
