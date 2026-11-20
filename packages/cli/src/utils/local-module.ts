import { existsSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { resolveTargetApp } from '../commands/add.ts'
import { resolveArg } from './refactor.ts'

export const MODULE_EXTS = ['.ts', '.mts', '.js', '.mjs']

export interface LocalModule {
  /** `file`: `modules/foo.ts`; `dir`: `modules/foo/index.ts`; `package`: a folder with a package.json. */
  kind: 'file' | 'dir' | 'package'
  /** The file (`file`) or folder (`dir`, `package`). */
  path: string
  /** `foo` for `modules/foo.ts` and `modules/foo/`. */
  name: string
}

/** What is at `path`: a single-file module, a folder module, a package folder, or nothing usable. */
export const inspectModulePath = (path: string): LocalModule | undefined => {
  if (!existsSync(path)) return undefined
  if (statSync(path).isFile()) {
    const ext = extname(path)
    return MODULE_EXTS.includes(ext) ? { kind: 'file', path, name: basename(path, ext) } : undefined
  }
  if (existsSync(join(path, 'package.json'))) return { kind: 'package', path, name: basename(path) }
  if (MODULE_EXTS.some(ext => existsSync(join(path, `index${ext}`)))) return { kind: 'dir', path, name: basename(path) }
  return undefined
}

/**
 * The local module `ref` names: a path (relative to `cwd`) to a module file, folder module or package folder, else a
 * bare name looked up in `modules/` of the app (`--app`, else as `add` picks it).
 */
export const resolveLocalModule = async (cwd: string, ref: string, app?: string): Promise<LocalModule> => {
  const direct = inspectModulePath(resolveArg(cwd, ref))
  if (direct) return direct
  if (/[\\/]/.test(ref) || extname(ref)) throw new Error(`No module file or folder at ${ref}`)

  const appDir = await resolveTargetApp(cwd, app)
  for (const candidate of [...MODULE_EXTS.map(ext => join(appDir, 'modules', `${ref}${ext}`)), join(appDir, 'modules', ref)]) {
    const found = inspectModulePath(candidate)
    if (found) return found
  }
  throw new Error(`No module ${ref} in ${join(appDir, 'modules')}`)
}
