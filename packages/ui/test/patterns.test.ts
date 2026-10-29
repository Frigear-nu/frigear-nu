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

  it('names the section switcher after its current section', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('aria-label="Event sections: Overview"')
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

  describe('app shell', () => {
    it('renders one h1 (the page heading), never the navbar title', async () => {
      const html = await $fetch<string>('/shell')
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(html).toMatch(/<h1[^>]*>(?:<!--\[-->)?\s*Shell page/)
      expect(html).toContain('data-area="app"')
      // Collapse and width persist under the area's id.
      expect(html).toContain('id="dashboard-sidebar-fixture"')
    })

    it('labels the navigation and shows the area and section as an eyebrow', async () => {
      const html = await $fetch<string>('/shell')
      expect(html).toContain('aria-label="Fixture navigation"')
      const eyebrow = /<p[^>]*data-slot="eyebrow"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
      expect(eyebrow).toContain('Fixture area')
      expect(eyebrow).toContain('Shell')
    })

    it('renders the collapse button, the mobile toggle, search and the sidebar footer', async () => {
      const html = await $fetch<string>('/shell')
      expect(html).toContain('aria-label="Collapse sidebar"')
      expect(html).toContain('aria-label="Open sidebar"')
      expect(html).toMatch(/<kbd[^>]*>/)
      expect(html).toContain('Back to the site')
      expect(html).toContain('Sidebar footer')
      expect(html).not.toContain('Switch to dark mode')
    })

    it('centres the body unless the page is wide', async () => {
      expect(await $fetch<string>('/shell')).toContain('max-w-7xl')
      expect(await $fetch<string>('/wide')).not.toContain('max-w-7xl')
    })

    it('titles the document after the section unless the page sets its own title', async () => {
      expect(await $fetch<string>('/shell')).toContain('<title>Shell</title>')
      expect(await $fetch<string>('/wide')).toContain('<title>Wide page</title>')
    })
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

  describe('status badge and titled table card', () => {
    // The class list of the badge showing `text`.
    const badge = (html: string, text: string) =>
      html.split('<span data-slot="base"').find(chunk => chunk.includes(`class="truncate">${text}</span>`))?.match(/class="([^"]*)"/)?.[1] ?? ''

    it('maps a status to its badge colour and lets `colors` override it', async () => {
      const html = await $fetch<string>('/table')
      expect(badge(html, 'published')).toContain('text-success')
      expect(badge(html, 'Awaiting review')).toContain('text-warning')
      expect(badge(html, 'failed')).toContain('text-error')
      // Unknown statuses are neutral; `archived` is neutral too until the override turns it amber.
      expect(badge(html, 'draft')).not.toMatch(/text-(success|warning|error)/)
      expect(badge(html, 'draft')).not.toBe('')
      expect(badge(html, 'archived')).toContain('text-warning')
    })

    it('renders nothing for an empty status without a label', async () => {
      const html = await $fetch<string>('/table')
      // published, Awaiting review, failed, draft and archived; the sixth badge has neither status nor label.
      expect(html.match(/<span data-slot="base"/g)).toHaveLength(5)
    })

    it('renders the title, description and actions of a TableCard header', async () => {
      const html = await $fetch<string>('/table')
      expect(html).toMatch(/<h2[^>]*>\s*Recent payments\s*<\/h2>/)
      expect(html).toContain('Last thirty days')
      expect(html).toContain('Export payments')
      expect(html).toContain('titled-table-body')
      // Cards without a title, description, `#header` or `#actions` have no header row.
      expect(html.match(/<h2/g)).toHaveLength(1)
    })
  })
})
