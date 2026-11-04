import { addDependency, installDependencies, runScript } from 'nypm'

export const installDeps = (cwd: string) => installDependencies({ cwd, packageManager: 'pnpm' })

export const addDeps = (names: string[], cwd: string) => addDependency(names, { cwd, packageManager: 'pnpm' })

export const runPackageScript = (name: string, cwd: string) => runScript(name, { cwd, packageManager: 'pnpm' })
