import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('admin area', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/with-contributions', import.meta.url)) })

  it('renders the dashboard with contributed widgets inside the admin layout', async () => {
    const html = await $fetch<string>('/admin')
    expect(html).toContain('stats-widget')
    expect(html).toContain('Administration')
    expect(html).toContain('Things')
  })

  it('applies the admin layout to other pages under the base', async () => {
    const html = await $fetch<string>('/admin/things')
    expect(html).toContain('things-page')
    expect(html).toContain('Administration')
  })

  it('leaves pages outside the base alone', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('public-home')
    expect(html).not.toContain('Administration')
  })
})
