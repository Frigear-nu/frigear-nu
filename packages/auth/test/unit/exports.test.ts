import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
type Entry = { types?: string, import?: string, default?: string }

// What `nuxt-module-build` emits for a source file: `src/runtime/x.ts` becomes `dist/runtime/x.js` and `x.d.ts`.
const built = (source: string, kind: 'js' | 'types') => source
  .replace(/^\.\/src\/runtime\//, './dist/runtime/')
  .replace(/\.ts$/, kind === 'js' ? '.js' : '.d.ts')

describe('package exports', () => {
  const subpaths = Object.keys(pkg.exports).filter(key => key !== '.')

  it('publishes every subpath it exports in development', () => {
    expect(Object.keys(pkg.publishConfig.exports).sort()).toEqual(Object.keys(pkg.exports).sort())
    // Older TypeScript resolution reads `typesVersions`; the client mode's subpaths ship one.
    for (const subpath of ['./mode', './client-core', './capacitor', './client-types']) {
      expect(pkg.publishConfig.typesVersions['*']).toHaveProperty(subpath.slice(2))
    }
  })

  it.each(subpaths)('%s points at a source file and at what the builder emits from it', (subpath) => {
    const dev = pkg.exports[subpath] as Entry
    const published = pkg.publishConfig.exports[subpath] as Entry
    expect(existsSync(`${root}/${dev.types}`)).toBe(true)
    expect(published.types).toBe(built(dev.types!, 'types'))
    const typesVersion = pkg.publishConfig.typesVersions['*'][subpath.slice(2)]
    if (typesVersion) expect(typesVersion).toEqual([published.types])
    if (dev.import) {
      expect(published.import).toBe(built(dev.import, 'js'))
      expect(published.default).toBe(published.import)
    }
  })

  it('keeps `@frigear-nu/auth/mode` free of @nuxt/kit, so other modules can call it from `moduleDependencies`', async () => {
    const source = readFileSync(`${root}/src/runtime/mode.ts`, 'utf8') + readFileSync(`${root}/src/runtime/utils/redirect.ts`, 'utf8')
    expect(source).not.toMatch(/from '@nuxt\/kit'|from 'nuxt|from '#/)
    const mode = await import('../../src/runtime/mode')
    expect(Object.keys(mode).sort()).toEqual(['isSafeRedirect', 'resolveAuthMode'])
  })
})
