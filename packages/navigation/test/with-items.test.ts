import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('ssr (with registered navigation files)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/with-items', import.meta.url)),
  })

  it('renders items from the root group, sorted by order', async () => {
    const html = await $fetch('/')
    const dashboardIndex = html.indexOf('Dashboard -&gt; /')
    const profileIndex = html.indexOf('Profile -&gt; /profile')
    expect(dashboardIndex).toBeGreaterThan(-1)
    expect(profileIndex).toBeGreaterThan(-1)
    expect(dashboardIndex).toBeLessThan(profileIndex)
  })

  it('renders items extended into a nested group', async () => {
    const html = await $fetch('/')
    expect(html).toContain('Security -&gt; /security')
  })
})
