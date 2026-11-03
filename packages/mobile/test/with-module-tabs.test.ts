import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('with-module-tabs (extendMobileTabs)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/with-module-tabs', import.meta.url)) })

  it('merges module tabs after the app\'s own, honours order, and relabels by id', async () => {
    const html = await $fetch<string>('/events')
    const tabbar = /<nav[^>]*data-mobile-tabbar[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    const hrefs = [...tabbar.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    // `tickets` has an `order`, so it goes first; the rest in registration order.
    expect(hrefs).toEqual(['/tickets', '/', '/account', '/events'])
    expect(tabbar).toContain('Start')
    expect(tabbar).not.toContain('>Home<')
    expect(html).toMatch(/<h1[^>]*>\s*Events\s*<\/h1>/)
  })
})
