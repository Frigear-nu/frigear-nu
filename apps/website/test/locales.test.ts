import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const app = 'apps/website/i18n/locales'
const modules = [
  'packages/ui/src/runtime/i18n/lang',
  'packages/users/src/runtime/i18n/lang',
  'packages/account/src/runtime/i18n/lang',
  'packages/subscriptions/src/runtime/i18n/lang',
  'packages/events/src/runtime/i18n/lang',
  'packages/payments/src/runtime/i18n/lang',
  'packages/forms/src/runtime/i18n/lang',
]
const slices = [app, ...modules]

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

  // Modules must not collide with each other. The app may override a module's key on purpose (e.g. calling the users
  // module's users "members"): project locales take precedence over the ones modules register.
  it.each(['da', 'en'])('%s has no key defined by more than one module', (locale) => {
    const all = modules.flatMap(dir => leaves(load(dir, locale)))
    expect(all.filter((key, index) => all.indexOf(key) !== index)).toEqual([])
  })

  it.each(['da', 'en'])('%s app overrides only keys a module defines', (locale) => {
    const moduleKeys = new Set(modules.flatMap(dir => leaves(load(dir, locale))))
    const overrides = ['users.admin.newUsers.title', 'users.admin.stats.newUsers']
    expect(overrides.filter(key => !moduleKeys.has(key))).toEqual([])
    const appKeys = leaves(load(app, locale))
    expect(appKeys.filter(key => moduleKeys.has(key) && !overrides.includes(key))).toEqual([])
  })
})
