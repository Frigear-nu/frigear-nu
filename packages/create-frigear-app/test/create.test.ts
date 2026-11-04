import { describe, expect, it } from 'vitest'
import { cliSpec, dlxCommand } from '../src/main.ts'

describe('create-frigear-app', () => {
  it('runs the latest CLI unless FRIGEAR_CLI names another', () => {
    expect(cliSpec({})).toBe('@frigear-nu/cli@latest')
    expect(cliSpec({ FRIGEAR_CLI: '@frigear-nu/cli@0.1.0' })).toBe('@frigear-nu/cli@0.1.0')
  })

  it.each([
    ['pnpm/10.12.1 npm/? node/v24.0.0 darwin arm64', 'pnpm', ['dlx', 'cli', 'init', 'my-app']],
    ['yarn/4.9.0 npm/? node/v24.0.0', 'yarn', ['dlx', 'cli', 'init', 'my-app']],
    ['yarn/1.22.22 npm/? node/v24.0.0', 'npx', ['--yes', '--package', 'cli', '--', 'frigear-nu', 'init', 'my-app']],
    ['bun/1.2.0 npm/? node/v24.0.0', 'bunx', ['cli', 'init', 'my-app']],
    ['npm/11.4.0 node/v24.0.0 darwin arm64', 'npx', ['--yes', '--package', 'cli', '--', 'frigear-nu', 'init', 'my-app']],
    ['', 'npx', ['--yes', '--package', 'cli', '--', 'frigear-nu', 'init', 'my-app']],
  ])('runs init with the package manager of %s', (userAgent, command, args) => {
    expect(dlxCommand(userAgent, 'cli', ['my-app'])).toEqual([command, args])
  })
})
