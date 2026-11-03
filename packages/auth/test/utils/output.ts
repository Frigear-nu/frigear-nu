import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { useTestContext } from '@nuxt/test-utils/e2e'

/** The built output of the fixture `setup()` built (`.output`), or one of its subfolders (`public`, `server`). */
export function outputDir(sub = '') {
  const dir = useTestContext().nuxt?.options.nitro.output?.dir
  if (!dir) throw new Error('No build output: call `setup()` with `build: true` first.')
  return join(dir, sub)
}

/** The files under `dir` (relative paths) whose text contains `needle`. Source maps are skipped. */
export function filesContaining(dir: string, needle: string | RegExp): string[] {
  const found: string[] = []
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!/\.(?:m?js|cjs|html|json|css)$/.test(name) || name.endsWith('.map')) continue
      const text = readFileSync(path, 'utf8')
      if (typeof needle === 'string' ? text.includes(needle) : needle.test(text)) found.push(relative(dir, path))
    }
  }
  walk(dir)
  return found
}
