import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('ssr (with registered menu items)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/with-items', import.meta.url)),
  })

  it('renders static (extendMenu) and dynamic (menu source) items, sorted by order', async () => {
    const html = await $fetch('/')
    const dashboardIndex = html.indexOf('Dashboard -&gt; /')
    const profileIndex = html.indexOf('Profile -&gt; /profile')
    expect(dashboardIndex).toBeGreaterThan(-1)
    expect(profileIndex).toBeGreaterThan(-1)
    expect(dashboardIndex).toBeLessThan(profileIndex)
  })

  it('renders items extended into a nested group (menu.group addressing)', async () => {
    const html = await $fetch('/')
    expect(html).toContain('Security -&gt; /security')
  })

  describe('menus:filter', () => {
    const staff = async (permissions?: string) => {
      const html = await (await fetch('/', { headers: permissions ? { 'x-test-permissions': permissions } : {} })).text()
      return html.match(/<ul id="staff">([\s\S]*?)<\/ul>/)?.[1] ?? ''
    }

    it('hides an item with a permission the viewer does not hold', async () => {
      const html = await staff()
      expect(html).toContain('Public')
      expect(html).not.toContain('Admin area')
    })

    it('shows it to a viewer who holds the permission', async () => {
      expect(await staff('admin:access')).toContain('Admin area')
    })

    it('resolves a menu again when the access version changes (sign-in as admin)', async () => {
      const html = await $fetch<string>('/?refilter')
      expect(html).toMatch(/before: Public(?!,)/)
      expect(html).toContain('after: Public,Admin area')
    })
  })

  describe('server useMenu', () => {
    const labels = async (path: string) =>
      (await $fetch<Array<{ label: string }>>('/api/menu', { query: { path } })).map(item => item.label)

    it('merges extendMenu and runtime source items, sorted by order', async () => {
      expect(await labels('dashboard')).toEqual(['Dashboard', 'Profile'])
    })

    it('returns items registered into a nested group', async () => {
      expect(await labels('dashboard.more')).toEqual(['Security'])
    })

    it('supports wildcard paths', async () => {
      expect(await labels('dashboard.*')).toEqual(['Dashboard', 'Profile', 'Security'])
    })

    it('does not duplicate items across requests', async () => {
      await labels('dashboard')
      expect(await labels('dashboard')).toEqual(['Dashboard', 'Profile'])
    })

    it('returns an empty list for an unknown menu', async () => {
      expect(await labels('missing')).toEqual([])
    })
  })
})
