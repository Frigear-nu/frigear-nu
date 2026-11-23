import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import da from '../../src/runtime/i18n/lang/da.json'
import en from '../../src/runtime/i18n/lang/en.json'

type Messages = { [key: string]: string | Messages }

const resolve = (messages: Messages, path: string): string | undefined => {
  const value = path.split('.').reduce<string | Messages | undefined>(
    (node, key) => (node && typeof node === 'object' ? node[key] : undefined),
    messages,
  )
  return typeof value === 'string' ? value : undefined
}

// Every `<translator>('key', 'English fallback')` call in a component, with the namespace its `useModuleT` names.
const translations = (file: string) => {
  const source = readFileSync(fileURLToPath(new URL(`../../src/runtime/app/${file}`, import.meta.url)), 'utf8')
  const namespaces = Object.fromEntries(
    [...source.matchAll(/const (\w+) = useModuleT\('([\w.]+)'\)/g)].map(([, name, namespace]) => [name, namespace]),
  )
  return [...source.matchAll(/\b(\w+)\('([\w.]+)', '((?:[^'\\]|\\.)*)'/g)]
    .filter(([, name]) => name! in namespaces)
    .map(([, name, key, fallback]) => ({ path: `${namespaces[name!]}.${key}`, fallback: fallback! }))
}

describe('push locale messages', () => {
  // The account page and the admin tab show their English fallback whenever a key is missing, so a typo or a key left
  // out of da.json only shows up as English text on the Danish site.
  it.each(['pages/devices.vue', 'tabs/Devices.vue'])('has a Danish and an English text for every string of %s', (file) => {
    const strings = translations(file)
    expect(strings.length).toBeGreaterThan(5)
    for (const { path, fallback } of strings) {
      expect(resolve(en as Messages, path), path).toBeTypeOf('string')
      const danish = resolve(da as Messages, path)
      expect(danish, path).toBeTypeOf('string')
      // Names that read the same in both languages (FCM, APNs, Platform, App, Status) are the only exceptions.
      if (!['FCM', 'APNs', 'Platform', 'App', 'Status'].includes(fallback)) {
        expect(danish, path).not.toBe(fallback)
      }
    }
  })

  it('resolves the headings and columns of the devices pages in Danish', () => {
    expect(resolve(da as Messages, 'push.menu.devices.label')).toBe('Enheder')
    expect(resolve(da as Messages, 'push.menu.devices.description')).toBe('De telefoner, der får dine pushnotifikationer.')
    expect(resolve(da as Messages, 'push.account.title')).toBe('Dine enheder')
    expect(resolve(da as Messages, 'push.account.device')).toBe('Enhed')
    expect(resolve(da as Messages, 'push.account.lastSeen')).toBe('Sidst set')
    expect(resolve(da as Messages, 'push.admin.title')).toBe('Pushenheder')
    expect(resolve(da as Messages, 'push.admin.sendTest')).toBe('Send test-push')
    expect(resolve(da as Messages, 'push.admin.locale')).toBe('Sprog')
  })
})
