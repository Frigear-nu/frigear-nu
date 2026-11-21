import { describe, expect, it } from 'vitest'
import { pushModuleDependencies } from '../../src/build'

const nuxtIn = (mode?: string) => ({ options: mode ? { authentication: { mode } } : {} })

// The mobile app runs auth in client mode: no NuxtHub, no users module, no nuxt-auth-utils. A push module that asked
// Nuxt for any of them would pull a whole server into an app that has none.
describe('module dependencies by auth mode', () => {
  it('installs no server module in client mode', () => {
    const dependencies = pushModuleDependencies(nuxtIn('client'))
    expect(Object.keys(dependencies).sort()).toEqual(['@frigear-nu/auth', '@frigear-nu/mobile', '@frigear-nu/module-kit'])
    expect(dependencies['@frigear-nu/mobile']).toMatchObject({ optional: true })
    for (const server of ['@nuxthub/core', '@frigear-nu/users', '@frigear-nu/notify', '@frigear-nu/ui', '@frigear-nu/admin', '@frigear-nu/widget', '@frigear-nu/menu']) {
      expect(dependencies).not.toHaveProperty(server)
    }
  })

  it('needs the database, users and notify in server mode, the default', () => {
    for (const mode of [undefined, 'server']) {
      const dependencies = pushModuleDependencies(nuxtIn(mode))
      expect(Object.keys(dependencies)).toEqual(expect.arrayContaining(['@nuxthub/core', '@frigear-nu/auth', '@frigear-nu/users', '@frigear-nu/notify', '@frigear-nu/module-kit']))
      // Everything else is optional.
      for (const optional of ['@frigear-nu/admin', '@frigear-nu/widget', '@frigear-nu/menu', '@frigear-nu/account', '@frigear-nu/mobile']) {
        expect(dependencies[optional]).toMatchObject({ optional: true })
      }
      expect(dependencies['@frigear-nu/users']).not.toHaveProperty('optional')
    }
  })

  it('refuses an unknown mode like the other modules do', () => {
    expect(() => pushModuleDependencies(nuxtIn('hybrid'))).toThrow(/authentication.mode/)
  })
})
