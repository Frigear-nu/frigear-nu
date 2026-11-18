import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const run = (args: string[]) => spawnSync('pnpm', ['exec', ...args], { cwd: root, encoding: 'utf-8', shell: process.platform === 'win32' })

// A host's `nitro.hooks.hook('authorization:roles', ctx => ...)` must type-check without casts: the hooks are generated
// into `nitropack/types` (`types/auth-hooks.d.ts`). `test/types/nitro-hooks.ts` is checked against the playground's
// server tsconfig; only its own diagnostics count (the playground has no database for the module's routes).
describe('nitro runtime hook types', () => {
  it('types auth\'s hooks in the host\'s server code', () => {
    const prepare = run(['nuxt', 'prepare', 'playground'])
    expect(prepare.status, prepare.stderr).toBe(0)
    const check = run(['vue-tsc', '--noEmit', '-p', 'test/types/tsconfig.json'])
    const own = `${check.stdout}${check.stderr}`.split('\n').filter(line => line.includes('test/types/'))
    expect(own).toEqual([])
  })
})
