import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

// The account navigation (desktop aside) starts at its aria-label.
const navOf = (html: string) => html.slice(html.indexOf('aria-label="Account navigation"'))
const linkTo = (html: string, path: string) => new RegExp(`<a[^>]*href="${path}"[^>]*>`).exec(navOf(html))?.[0]

describe('account shell', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/shell', import.meta.url)),
    // Cold builds on shared CI runners can take longer than vitest's 120s default.
    setupTimeout: 240_000,
  })

  it('renders a page another module adds under /account inside the site layout, with the account nav and heading', async () => {
    const html = await $fetch<string>('/account/extra')
    expect(html).toContain('site header')
    expect(html).toContain('extra page body')
    expect(html).toContain('aria-label="Account navigation"')
    // The heading follows the menu item the route belongs to.
    expect(html).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Extra things\s*(?:<!--[^>]*-->)?<\/h1>/)
    expect(html).toContain('Added by another module.')
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

  it('renders the shipped pages in the shell', async () => {
    const html = await $fetch<string>('/account/security')
    expect(html).toContain('aria-label="Account navigation"')
    expect(html).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Security\s*(?:<!--[^>]*-->)?<\/h1>/)
    expect(html).toContain('Change password')
  })

  it('lists the account pages as shortcuts on the overview', async () => {
    const html = await $fetch<string>('/account')
    const body = html.slice(html.lastIndexOf('Your account'))
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
