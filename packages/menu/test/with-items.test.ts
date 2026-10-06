import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

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
})
