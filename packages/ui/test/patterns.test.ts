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

  it('renders the identity cell with its second line', async () => {
    const html = await $fetch<string>('/table')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('ada@example.com')
  })

  it('shows the range, rows per page and pages of a long list', async () => {
    const html = await $fetch<string>('/table')
    expect(html).toContain('21–40 of 132')
    expect(html).toContain('Rows per page')
    expect(html).toMatch(/aria-busy="true"/)
  })

  it('hides paging when everything fits on one page', async () => {
    const html = await $fetch<string>('/table')
    expect(html).toContain('1–3 of 3')
    expect(html.match(/Rows per page/g)).toHaveLength(1)
  })

  it('useCachedFetch renders awaited data on the server, without copying it into the cache state', async () => {
    const html = await $fetch<string>('/cached-fetch')
    expect(html).toMatch(/<li[^>]*>\s*alpha\s*<\/li>/)
    expect(html).not.toContain('Loading items')
    expect(html).not.toContain('No items')
    // Once in the markup and once in the payload (as `useFetch` data): the client-side cache starts empty.
    expect(html.match(/alpha/g)).toHaveLength(2)
  })

  it('useCachedFetch renders a failed request as an error, not as an empty list', async () => {
    const html = await $fetch<string>('/cached-fetch?fail=1')
    expect(html).toContain('Failed: Forbidden')
    expect(html).not.toContain('No items')
  })
})
