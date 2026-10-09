import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const slices = [
  'apps/website/i18n/locales',
  'packages/ui/src/runtime/i18n/lang',
  'packages/users/src/runtime/i18n/lang',
  'packages/account/src/runtime/i18n/lang',
  'packages/subscriptions/src/runtime/i18n/lang',
  'packages/events/src/runtime/i18n/lang',
]

const load = (dir: string, locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(root, dir, `${locale}.json`), 'utf8'))

const leaves = (value: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object'
      ? leaves(child as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )

describe('locale files', () => {
  it.each(slices)('%s has identical da and en keys', (dir) => {
    expect(leaves(load(dir, 'en')).sort()).toEqual(leaves(load(dir, 'da')).sort())
  })

  it.each(['da', 'en'])('%s has no key defined by more than one slice', (locale) => {
    const all = slices.flatMap(dir => leaves(load(dir, locale)))
    expect(all.filter((key, index) => all.indexOf(key) !== index)).toEqual([])
  })
})
