import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('page patterns', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/patterns', import.meta.url)) })

  it('renders the heading with a breadcrumb back to the list', async () => {
    const html = await $fetch<string>('/')
    expect(html).toMatch(/<h1[^>]*>(?:<!--\[-->)?\s*Spring meetup/)
    expect(html).toMatch(/<nav[^>]*aria-label="breadcrumb"/i)
    expect(html).toMatch(/<a[^>]*href="\/events"[^>]*>[\s\S]*?Events/)
  })

  it('renders a string breadcrumb as an eyebrow line', async () => {
    const html = await $fetch<string>('/other')
    expect(html).toContain('Eyebrow line')
    expect(html).not.toMatch(/aria-label="breadcrumb"/i)
  })

  it('names the row menu after its subject, with a generic fallback', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('aria-label="Actions for Spring meetup"')
    expect(html).toContain('aria-label="More actions"')
  })

  it('shows "Not set" for empty description values', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('Copenhagen')
    expect(html).toContain('Not set')
  })

  it('marks the tab of the current route', async () => {
    const html = await $fetch<string>('/')
    const overview = /<a[^>]*href="\/"[^>]*>/.exec(html)?.[0]
    const other = /<a[^>]*href="\/other"[^>]*>/.exec(html)?.[0]
    expect(overview).toContain('aria-current="page"')
    expect(other).toBeDefined()
    expect(other).not.toContain('aria-current')
  })
})
