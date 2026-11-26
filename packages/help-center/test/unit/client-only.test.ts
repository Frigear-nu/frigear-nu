import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import module from '../../src/module'

// A client-only app (`isClientOnlyApp`, e.g. a mobile app on `@frigear-nu/mobile`) installs the module for its pages:
// it calls a remote API, so the server-only modules stay out.
const dependencies = async (clientOnly: boolean) => Object.keys(await module.getModuleDependencies!({
  options: { modules: [], moduleKit: { clientOnly } },
} as unknown as Nuxt) ?? {})

describe('module dependencies in a client-only app', () => {
  it('leaves out the server-only modules', async () => {
    expect(await dependencies(false)).toEqual(expect.arrayContaining(['@nuxthub/core']))
    const clientOnly = await dependencies(true)
    for (const name of ['@nuxthub/core']) expect(clientOnly).not.toContain(name)
    expect(clientOnly).toContain('@frigear-nu/module-kit')
  })
})
