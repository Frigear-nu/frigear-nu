import { describe, expect, it } from 'vitest'
import { resolveStarter } from '../src/commands/init.ts'
import { toPackageName } from '../src/utils/workspace.ts'

describe('toPackageName', () => {
  it.each([
    ['My App', 'my-app'],
    ['my app', 'my-app'],
    ['myApp', 'my-app'],
    ['my-app', 'my-app'],
    ['  Shop & Blog!  ', 'shop-blog'],
  ])('%s → %s', (input, expected) => {
    expect(toPackageName(input)).toBe(expected)
  })
})

describe('resolveStarter', () => {
  it.each([
    ['web', 'workspace'],
    ['mobile', 'mobile'],
    ['web,mobile', 'mobile-standalone'],
    ['Mobile, Web', 'mobile-standalone'],
    ['workspace', 'workspace'],
    ['mobile-standalone', 'mobile-standalone'],
    ['desktop', undefined],
    ['', undefined],
  ])('%s → %s', (input, expected) => {
    expect(resolveStarter(input)).toBe(expected)
  })
})
