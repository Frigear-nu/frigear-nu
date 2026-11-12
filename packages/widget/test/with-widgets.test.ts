import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('ssr (registered widgets)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/with-widgets', import.meta.url)) })

  it('renders widgets in order, with their props', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('widget-first')
    expect(html).toContain('widget-second:from-props')
    expect(html.indexOf('widget-first')).toBeLessThan(html.indexOf('widget-second'))
  })

  it('lets a widgets:filter listener hide widgets', async () => {
    expect(await $fetch<string>('/')).not.toContain('widget-secret')
  })
  it('renders a tab list in order, with plain labels as the fallback for a missing labelKey', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('role="tablist"')
    expect(html.indexOf('First tab')).toBeLessThan(html.indexOf('Second tab'))
    expect(html.indexOf('Second tab')).toBeLessThan(html.indexOf('TabThird'))
  })

  it('renders the first tab and hands it the host context', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('tab-first:ctx')
    expect(html).not.toContain('tab-second')
  })

  it('renders the tab named in ?tab=', async () => {
    expect(await $fetch<string>('/?tab=TabSecond')).toContain('tab-second')
  })

  it('lets a tabs:filter listener hide tabs, and keeps tabs apart from widgets', async () => {
    const html = await $fetch<string>('/')
    expect(html).not.toContain('Secret tab')
    expect(html).toContain('widget-first')
  })

  it('hides widgets and tabs carrying a permission from a viewer who lacks it, shows them to one who has it', async () => {
    const page = async (permissions?: string) =>
      (await fetch('/', { headers: permissions ? { 'x-test-permissions': permissions } : {} })).text()
    const without = await page()
    expect(without).not.toContain('Staff tab')
    expect(without).not.toContain('widget-secret')
    const withPermission = await page('staff:view')
    expect(withPermission).toContain('Staff tab')
    expect(withPermission).toContain('widget-secret')
  })
})
