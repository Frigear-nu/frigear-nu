import { addDependency, detectPackageManager, installDependencies, runScript, type PackageManagerName } from 'nypm'
import { x } from 'tinyexec'

/** The package manager of the workspace at `cwd` (its `packageManager` field or lockfile), pnpm when unknown. */
export const packageManagerOf = async (cwd: string): Promise<PackageManagerName> =>
  (await detectPackageManager(cwd, { includeParentDirs: true }).catch(() => undefined))?.name ?? 'pnpm'

export const installDeps = async (cwd: string) =>
  installDependencies({ cwd, packageManager: await packageManagerOf(cwd) })

export const addDeps = async (names: string[], cwd: string) =>
  addDependency(names, { cwd, packageManager: await packageManagerOf(cwd) })

export const runPackageScript = async (name: string, cwd: string, args?: string[]) =>
  runScript(name, { cwd, packageManager: await packageManagerOf(cwd), args })

/** Runs a binary of the package at `cwd` (`pnpm exec <bin> ...`), with the terminal attached. */
export const execBin = async (bin: string, args: string[], cwd: string) => {
  const pm = await packageManagerOf(cwd)
  const command = pm === 'npm' ? 'npx' : pm
  const result = await x(command, pm === 'npm' ? ['--no-install', bin, ...args] : ['exec', bin, ...args], {
    nodeOptions: { cwd, stdio: 'inherit' },
    throwOnError: true,
  })
  return result
}
