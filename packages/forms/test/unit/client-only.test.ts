import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'

// Their runtime imports Vue, which a unit test has no app for; the dependencies need neither.
vi.mock('@frigear-nu/admin/utils', () => ({ adminRoute: vi.fn() }))
vi.mock('@frigear-nu/mcp/utils', () => ({ addMcpDefinitions: vi.fn() }))

const { default: module } = await import('../../src/module')

// A client-only app (`isClientOnlyApp`, e.g. a mobile app on `@frigear-nu/mobile`) installs the module for its pages:
// it calls a remote API, so the server-only modules stay out.
const dependencies = async (clientOnly: boolean) => Object.keys(await module.getModuleDependencies!({
  options: { modules: [], moduleKit: { clientOnly } },
} as unknown as Nuxt) ?? {})

describe('module dependencies in a client-only app', () => {
  it('leaves out the server-only modules', async () => {
    expect(await dependencies(false)).toEqual(expect.arrayContaining(['@nuxthub/core', '@frigear-nu/mcp']))
    const clientOnly = await dependencies(true)
    for (const name of ['@nuxthub/core', '@frigear-nu/mcp']) expect(clientOnly).not.toContain(name)
    expect(clientOnly).toContain('@frigear-nu/module-kit')
  })
})
