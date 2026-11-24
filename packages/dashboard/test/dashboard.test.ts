import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const page = async (path: string, headers: Record<string, string> = {}) => (await fetch(path, { headers })).text()
/** The rendered markup, without the payload (which carries every item's widget data before the platform filter). */
const rendered = (html: string) => html.slice(0, html.indexOf('<script type="application/json"'))
/** Item ids in the order the frames appear in the HTML. */
const frames = (html: string) => [...html.matchAll(/data-dashboard-item="([^"]+)"/g)].map(match => match[1])

describe('dashboard (two modules, one dashboard)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)) })

  it('renders both modules\' items in registered order, with props and the page context', async () => {
    const html = await $fetch<string>('/')
    expect(frames(html)).toEqual(['shifts.next', 'faq.latest', 'faq.web', 'faq.with-shifts', 'shifts.hours', 'shifts.optional'])
    expect(html).toContain('item-next-shift:Saturday:volunteer')
    expect(html).toContain('item-faq')
    // The title falls back to `title` when `titleKey` cannot be translated.
    expect(html).toContain('Latest answers')
  })

  it('hides an item whose permission the viewer lacks, shows it to one who has it', async () => {
    expect(await page('/')).not.toContain('item-staff')
    const allowed = await page('/', { 'x-test-permissions': 'shifts:manage' })
    expect(frames(allowed)).toEqual(['shifts.next', 'faq.latest', 'shifts.staff', 'faq.web', 'faq.with-shifts', 'shifts.hours', 'shifts.optional'])
  })

  it('filters by platform: web-only items show on the web, mobile-only items do not', async () => {
    const html = rendered(await page('/'))
    expect(html).toContain('item-web-only')
    expect(html).not.toContain('item-mobile-only')
  })

  it('ships only the items whose `when.module` is installed', async () => {
    const html = await page('/')
    expect(rendered(html)).toContain('item-when-present')
    // Dropped at build time: not even in the payload.
    expect(html).not.toContain('item-when-absent')
  })

  it('hands an item its settings through useDashboardItem', async () => {
    expect(rendered(await page('/'))).toContain('item-hours:month')
    const layout = { order: [], hidden: [], collapsed: [], settings: { 'shifts.hours': { range: 'year' } } }
    expect(rendered(await page('/', { 'x-test-layout': JSON.stringify(layout) }))).toContain('item-hours:year')
  })

  it('keeps an optional item out of the server-rendered grid, title included, while its content still renders', async () => {
    const html = rendered(await page('/'))
    const frame = html.match(/<div[^>]*data-dashboard-item="shifts\.optional"[^>]*>/)?.[0]
    expect(frame).toContain('display:none')
    // Rendered (hidden) so the client can check it for content and show the frame.
    expect(html).toContain('item-optional')
    // A regular item is shown from the start.
    expect(html.match(/<div[^>]*data-dashboard-item="shifts\.hours"[^>]*>/)?.[0]).not.toContain('display:none')
  })

  it('applies the user\'s layout: order, hidden and collapsed items', async () => {
    const layout = { order: ['faq.web', 'shifts.next'], hidden: ['faq.latest'], collapsed: ['faq.with-shifts'] }
    const html = rendered(await page('/', { 'x-test-layout': JSON.stringify(layout) }))
    // Items missing from `order` follow their registered predecessor: `faq.with-shifts` (then `shifts.hours`) after
    // `faq.web`.
    expect(frames(html)).toEqual(['faq.web', 'faq.with-shifts', 'shifts.hours', 'shifts.optional', 'shifts.next'])
    expect(html).not.toContain('item-faq')
    // Collapsed: the frame and its title stay, the content is not rendered.
    expect(html).toContain('Expand With shifts')
    expect(html).not.toContain('item-when-present')
  })

  it('lets a page lay out the same items itself with useDashboard', async () => {
    const html = rendered(await page('/custom', { 'x-test-layout': JSON.stringify({ order: [], hidden: ['faq.web'], collapsed: [] }) }))
    expect(html).toContain('Custom layout')
    // The first item is drawn with its frame, the rest as the page's own list.
    expect(html.slice(html.indexOf('data-custom-featured'))).toContain('item-next-shift:Saturday:nobody')
    const listed = [...html.matchAll(/custom:([^:<]+):([^<]*)</g)].map(match => match[1])
    expect(listed).toEqual(['faq.latest', 'faq.with-shifts', 'shifts.hours', 'shifts.optional'])
    expect(html).toContain('hidden:faq.web')
    expect(html).not.toContain('item-staff')
  })

  it('has no hub without @frigear-nu/auth', async () => {
    expect((await fetch('/dashboard')).status).toBe(404)
  })
})
