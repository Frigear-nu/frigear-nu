import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('basic (SSR shell)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)) })

  it('renders the layout: header with the tab title, the page, the web tab bar', async () => {
    const html = await $fetch<string>('/')
    expect(html).toMatch(/<h1[^>]*>\s*Home\s*<\/h1>/)
    expect(html).toContain('home-page')
    const tabbar = /<nav[^>]*data-mobile-tabbar[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    expect(tabbar).toContain('href="/bills"')
    expect(tabbar).toContain('Bills')
    expect(tabbar.indexOf('Home')).toBeLessThan(tabbar.indexOf('Bills'))
    expect(tabbar).toMatch(/aria-current="page"[^>]*>[\s\S]*?Home/)
  })

  it('titles a tab root after the tab and a page after its meta', async () => {
    expect(await $fetch<string>('/bills')).toMatch(/<h1[^>]*>\s*Your bills\s*<\/h1>/)
    const detail = await $fetch<string>('/bills/7')
    expect(detail).toMatch(/<h1[^>]*>\s*Bill details\s*<\/h1>/)
    expect(detail).toContain('aria-label="Back"')
    // Still on the bills tab.
    expect(detail).toContain('data-mobile-tabbar')
  })

  it('leaves out the header where the page turns the navbar off, and the tab bar off the tabs', async () => {
    const html = await $fetch<string>('/plain')
    expect(html).toContain('plain-page')
    expect(html).not.toMatch(/<header/)
    expect(html).not.toContain('data-mobile-tabbar')
  })

  it('shows a page\'s navbar actions in the header on that page only', async () => {
    const header = (html: string) => /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? ''
    // `definePageMeta` actions: an icon button named by its label.
    expect(header(await $fetch<string>('/'))).toContain('aria-label="Settings"')
    expect(header(await $fetch<string>('/bills'))).not.toContain('aria-label="Settings"')
    expect(header(await $fetch<string>('/bills/7'))).not.toContain('aria-label="Settings"')
    // `useMobileNavbarActions()` registers in the page's setup, after the layout rendered the header: on the server
    // it is not in the HTML (it shows once the page is set up in the browser), and the page still renders.
    expect(await $fetch<string>('/bills')).toContain('bills-page')
  })

  it('sets the mobile head defaults', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('name="format-detection" content="telephone=no"')
  })
})
