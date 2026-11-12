import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { loadNuxt } from '@nuxt/kit'

const rootDir = fileURLToPath(new URL('./fixtures/guarded', import.meta.url))

// Enforcement (guests and users without `admin:access` are turned away from `/admin/**`, an admin gets in) is covered by
// `@frigear-nu/authorization`'s `authenticated` fixture with the same rule; here the admin module's own wiring is checked.
describe('admin area wiring with @frigear-nu/authorization', () => {
  it('registers `admin:access` (not implicit, for the admin role), puts it on the area and on the account-menu entry', async () => {
    const nuxt = await loadNuxt({ cwd: rootDir, dev: false, ready: true })
    const permissions: Array<{ name: string, implicit?: boolean, grantTo?: string[] }> = []
    await nuxt.callHook('auth:permissions' as never, permissions as never)
    expect(permissions.find(permission => permission.name === 'admin:access')).toMatchObject({ grantTo: ['admin'] })
    expect(permissions.find(permission => permission.name === 'admin:access')?.implicit).toBeFalsy()

    const rules = nuxt.options.routeRules as Record<string, Record<string, unknown>>
    expect(rules['/admin/**']).toMatchObject({ permission: 'admin:access' })
    expect(rules['/admin/**']).not.toHaveProperty('roles')

    const extensions = (nuxt.options.menus as { _extensions?: Record<string, Record<string, Array<{ id?: string, permission?: string, meta?: unknown }>>> })._extensions
    const entry = Object.values(extensions?.account ?? {}).flat().find(item => item.id === 'admin')
    expect(entry?.permission).toBe('admin:access')
    expect(entry?.meta).toBeUndefined()
    await nuxt.close()
  })

  it('takes a custom permission, and none with `permission: false`', async () => {
    const custom = await loadNuxt({ cwd: rootDir, dev: false, ready: true, overrides: { admin: { settings: { permission: 'staff:enter' } } } as never })
    expect((custom.options.routeRules as Record<string, Record<string, unknown>>)['/admin/**']).toMatchObject({ permission: 'staff:enter' })
    await custom.close()

    const open = await loadNuxt({ cwd: rootDir, dev: false, ready: true, overrides: { admin: { settings: { permission: false } } } as never })
    expect((open.options.routeRules as Record<string, Record<string, unknown>>)['/admin/**']).not.toHaveProperty('permission')
    await open.close()
  })

  it('fails the build on the removed `roles` setting', async () => {
    await expect(loadNuxt({ cwd: rootDir, dev: false, ready: true, overrides: { admin: { settings: { roles: ['admin'] } } } as never })).rejects.toThrow(/roles.*removed/)
  })
})
