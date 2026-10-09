import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('cookie-consent (cookie only)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)) })

  it('renders the index page', async () => {
    expect(await $fetch('/')).toContain('<div>basic</div>')
  })

  it('exposes the default categories and treats a visitor as undecided', async () => {
    const result = await $fetch<{ consent: unknown, analytics: boolean, categories: string[] }>('/api/consent')
    expect(result.categories).toEqual(['necessary', 'analytics', 'marketing'])
    expect(result.consent).toBeNull()
    expect(result.analytics).toBe(false)
  })

  it('reads a current consent cookie on the server', async () => {
    const { version } = await $fetch<{ version: string }>('/api/consent')
    const cookie = encodeURIComponent(JSON.stringify({ v: version, ts: 1, categories: { necessary: true, analytics: true, marketing: false } }))
    const result = await $fetch<{ analytics: boolean }>('/api/consent', { headers: { cookie: `cookie-consent=${cookie}` } })
    expect(result.analytics).toBe(true)
  })

  it('ignores consent made against another version and migrates legacy values', async () => {
    const stale = encodeURIComponent(JSON.stringify({ v: 'old', ts: 1, categories: { analytics: true } }))
    expect((await $fetch<{ analytics: boolean }>('/api/consent', { headers: { cookie: `cookie-consent=${stale}` } })).analytics).toBe(false)
    expect((await $fetch<{ analytics: boolean }>('/api/consent', { headers: { cookie: 'cookie-consent=accepted' } })).analytics).toBe(true)
  })
})
