import { describe, expect, it } from 'vitest'
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
