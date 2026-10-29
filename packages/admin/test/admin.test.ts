import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

const navOf = (html: string) => html.slice(html.indexOf('Admin navigation'))

describe('admin area', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/with-contributions', import.meta.url)) })

  it('renders the dashboard with contributed widgets inside the admin layout', async () => {
    const html = await $fetch<string>('/admin')
    expect(html).toContain('stats-widget')
    expect(html).toContain('Administration')
    expect(html).toContain('Things')
  })

  it('groups the sidebar: Dashboard, then Manage, then Settings', async () => {
    const nav = navOf(await $fetch<string>('/admin/things'))
    const order = ['Dashboard', '>Manage<', 'Things', '>Settings<', 'Config'].map(text => nav.indexOf(text))
    for (const index of order) expect(index).toBeGreaterThan(-1)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('only marks the dashboard active on the dashboard itself', async () => {
    const onThings = await $fetch<string>('/admin/things')
    const dashboardLink = /<a[^>]*href="\/admin"[^>]*>/.exec(navOf(onThings))?.[0]
    expect(dashboardLink).toBeDefined()
    expect(dashboardLink).not.toContain('aria-current')
    const thingsLink = /<a[^>]*href="\/admin\/things"[^>]*>/.exec(navOf(onThings))?.[0]
    expect(thingsLink).toContain('aria-current')

    const onDashboard = await $fetch<string>('/admin')
    const active = /<a[^>]*href="\/admin"[^>]*>/.exec(navOf(onDashboard))?.[0]
    expect(active).toContain('aria-current')
  })

  it('keeps the colour-mode toggle out of the navbar', async () => {
    const html = await $fetch<string>('/admin/things')
    expect(html).not.toContain('Switch to dark mode')
    expect(html).not.toContain('Switch to light mode')
  })

  it('applies the admin layout to other pages under the base', async () => {
    const html = await $fetch<string>('/admin/things')
    expect(html).toContain('things-page')
    expect(html).toContain('Administration')
  })

  it('renders the shared page components', async () => {
    const html = await $fetch<string>('/admin/things')
    // PageHeading: the breadcrumb links back to the list, `#actions` holds the links.
    expect(html).toMatch(/<nav[^>]*aria-label="breadcrumb"/i)
    expect(html).toContain('alias-back')
    expect(html).toMatch(/<h1[^>]*>(?:<!--\[-->)?alias-heading/)
    expect(html).toContain('alias-description')
    expect(html).toContain('alias-links')
    expect(html).toContain('alias-toolbar')
    // SectionCard + TableCard around a UTable.
    expect(html).toContain('alias-section')
    expect(html).toContain('alias-table-row')
    // DescriptionList: slots per key, "Not set" for empty values.
    expect(html).toContain('alias-plan-slot')
    expect(html).toContain('Not set')
    expect(html).toContain('alias-stat-value')
    expect(html).toContain('alias-list-row')
    expect(html).toContain('View all')
    expect(html).toContain('alias-empty')
  })

  it('renders exactly one h1: the page heading, not the shell navbar', async () => {
    const html = await $fetch<string>('/admin/things')
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('leaves pages outside the base alone', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('public-home')
    expect(html).not.toContain('Administration')
  })
})
