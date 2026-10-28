import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

const marker = 'data-testid="host-admin-layout"'

describe('admin area in a host layout', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/host-layout', import.meta.url)) })

  it('renders pages under the base in the app\'s own `admin` layout instead of the module\'s', async () => {
    const html = await $fetch<string>('/admin/things')
    expect(html).toContain(marker)
    expect(html).toContain('things-page')
    expect(html.indexOf(marker)).toBeLessThan(html.indexOf('things-page'))
    // Not the module's layout: no `AppShell` and no admin navigation.
    expect(html).not.toContain('data-area="app"')
    expect(html).not.toContain('Admin navigation')
  })

  it('renders the dashboard in the host layout as well', async () => {
    const html = await $fetch<string>('/admin')
    expect(html).toContain(marker)
    expect(html).not.toContain('data-area="app"')
  })
})
