import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// nuxt-module-build transpiles src/runtime file by file and keeps import specifiers as written, so a './x.ts'
// specifier ships in dist pointing at a file that only exists as x.js there.
const relativeTsSpecifier = /(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]*\.ts)['"]/g

describe('runtime import specifiers', () => {
  it('has no relative .ts specifiers in any module runtime', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const files = globSync('packages/*/src/runtime/**/*.{ts,vue}', { cwd: root })
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.flatMap(file => [...readFileSync(`${root}/${file}`, 'utf8').matchAll(relativeTsSpecifier)]
      .map(match => `${file}: ${match[1]}`))
    expect(offenders).toEqual([])
  })
})
