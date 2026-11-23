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
    // The Settings > Search rebuild needs a registered search index, which this fixture has none of: no permission, no
    // route, no page and no menu entry (`@frigear-nu/users`' admin-db fixture covers the app with an index).
    expect(permissions.find(permission => permission.name === 'search:reindex')).toBeUndefined()
    expect(nuxt.options.serverHandlers.some(handler => handler.route === '/api/admin/search/reindex')).toBe(false)
    expect(nuxt.apps.default?.pages?.some(page => page.path === '/admin/search') ?? false).toBe(false)

    const rules = nuxt.options.routeRules as Record<string, Record<string, unknown>>
    expect(rules['/admin/**']).toMatchObject({ permission: 'admin:access' })
    expect(rules['/admin/**']).not.toHaveProperty('roles')

    const extensions = (nuxt.options.menus as { _extensions?: Record<string, Record<string, Array<{ id?: string, permission?: string, meta?: unknown }>>> })._extensions
    const entry = Object.values(extensions?.account ?? {}).flat().find(item => item.id === 'admin')
    expect(entry?.permission).toBe('admin:access')
    expect(entry?.meta).toBeUndefined()
    const settingsEntries = Object.values(extensions?.['admin.nav.settings'] ?? {}).flat()
    expect(settingsEntries.some(item => item.id === 'admin-search')).toBe(false)

    // The permission is decided when auth collects permissions (its `modules:done`), so an index any module registered
    // during setup counts: with one, `search:reindex` is there (session only, for admins).
    nuxt.options._searchIndexes = [{ name: 'test', handler: '/dev/null' }]
    const withIndex: typeof permissions = []
    await nuxt.callHook('auth:permissions' as never, withIndex as never)
    expect(withIndex.find(permission => permission.name === 'search:reindex')).toMatchObject({ grantTo: ['admin'], sessionOnly: true })
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
