import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

const h1Count = (html: string) => html.match(/<h1[\s>]/g)?.length ?? 0
// The account navigation (the left column on wide screens) starts at its aria-label.
const navOf = (html: string) => html.slice(html.indexOf('aria-label="Account navigation"'))
const linkTo = (html: string, path: string) => new RegExp(`<a[^>]*href="${path}"[^>]*>`).exec(navOf(html))?.[0]

describe('account shell', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/shell', import.meta.url)),
    // Cold builds on shared CI runners can take longer than vitest's 120s default.
    setupTimeout: 240_000,
  })

  it('renders a page another module adds under /account inside the site layout, with its own heading', async () => {
    const html = await $fetch<string>('/account/extra')
    // The site layout (header) wraps the account area: it is a settings page of the site, not a dashboard.
    expect(html).toContain('site header')
    expect(html.indexOf('site header')).toBeLessThan(html.indexOf('aria-label="Account navigation"'))
    expect(html).toContain('extra page body')
    expect(html).toContain('aria-label="Account navigation"')
    expect(html).not.toContain('data-area="app"')
    expect(html).not.toContain('Back to the site')
    // Narrow screens get the same entries as a section switcher naming the current one.
    expect(html).toContain('aria-label="Account navigation: Extra things"')
    // The page renders the only heading; the layout renders none.
    expect(html).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Extra things\s*(?:<!--[^>]*-->)?<\/h1>/)
    expect(h1Count(html)).toBe(1)
    // The layout's default document title is the active navigation entry.
    expect(html).toContain('<title>Extra things</title>')
    // Every account page links to the others, ordered by the menu.
    const nav = navOf(html)
    const order = ['Overview', 'Profile', 'Security', 'Extra things'].map(text => nav.indexOf(text))
    for (const index of order) expect(index).toBeGreaterThan(-1)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('marks the current page active and the overview only on its own path', async () => {
    const onExtra = await $fetch<string>('/account/extra')
    expect(linkTo(onExtra, '/account/extra')).toContain('aria-current')
    expect(linkTo(onExtra, '/account')).toBeDefined()
    expect(linkTo(onExtra, '/account')).not.toContain('aria-current')

    const onOverview = await $fetch<string>('/account')
    expect(linkTo(onOverview, '/account')).toContain('aria-current')
  })

  it('renders the shipped pages in the site layout with exactly one heading', async () => {
    const html = await $fetch<string>('/account/security')
    expect(html).toContain('site header')
    expect(html).toContain('aria-label="Account navigation"')
    expect(html).toContain('aria-label="Account navigation: Security"')
    expect(html).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Security\s*(?:<!--[^>]*-->)?<\/h1>/)
    expect(html).toContain('Change password')
    expect(h1Count(html)).toBe(1)
    // The heading description comes from the menu item.
    expect(html).toContain('Change your password and manage passkeys.')

    const overview = await $fetch<string>('/account')
    expect(overview).toContain('site header')
    expect(overview).toContain('aria-label="Account navigation: Overview"')
    expect(overview).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Overview\s*(?:<!--[^>]*-->)?<\/h1>/)
    expect(h1Count(overview)).toBe(1)
  })

  it('lists the account pages as shortcuts on the overview', async () => {
    const html = await $fetch<string>('/account')
    // The rendered markup only: the payload also carries menu labels (and "Your account." of the account menu).
    const markup = html.slice(0, html.indexOf('__NUXT_DATA__'))
    const body = markup.slice(markup.lastIndexOf('Your account'))
    expect(body).toContain('Extra things')
    expect(body).toContain('Profile')
    expect(body).toContain('Security')
  })

  it('leaves pages outside the account area alone', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('home page')
    expect(html).toContain('site header')
    expect(html).not.toContain('Account navigation')
  })
})
