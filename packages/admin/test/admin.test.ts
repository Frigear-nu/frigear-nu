import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('admin area', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/with-contributions', import.meta.url)) })

  it('renders the dashboard with contributed widgets inside the admin layout', async () => {
    const html = await $fetch<string>('/admin')
    expect(html).toContain('stats-widget')
    expect(html).toContain('Administration')
    expect(html).toContain('Things')
  })

  it('lists the dashboard first in the sidebar, then the contributed pages', async () => {
    const html = await $fetch<string>('/admin/things')
    const nav = html.slice(html.indexOf('Admin navigation'))
    expect(nav.indexOf('Dashboard')).toBeGreaterThan(-1)
    expect(nav.indexOf('Dashboard')).toBeLessThan(nav.indexOf('Things'))
  })

  it('only marks the dashboard active on the dashboard itself', async () => {
    const onThings = await $fetch<string>('/admin/things')
    const dashboardLink = /<a[^>]*href="\/admin"[^>]*>/.exec(onThings.slice(onThings.indexOf('Admin navigation')))?.[0]
    expect(dashboardLink).toBeDefined()
    expect(dashboardLink).not.toContain('aria-current')

    const onDashboard = await $fetch<string>('/admin')
    const active = /<a[^>]*href="\/admin"[^>]*>/.exec(onDashboard.slice(onDashboard.indexOf('Admin navigation')))?.[0]
    expect(active).toContain('aria-current')
  })

  it('applies the admin layout to other pages under the base', async () => {
    const html = await $fetch<string>('/admin/things')
    expect(html).toContain('things-page')
    expect(html).toContain('Administration')
  })

  it('leaves pages outside the base alone', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('public-home')
    expect(html).not.toContain('Administration')
  })
})
