import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('ssr (registered widgets)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/with-widgets', import.meta.url)) })

  it('renders widgets in order, with their props', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('widget-first')
    expect(html).toContain('widget-second:from-props')
    expect(html.indexOf('widget-first')).toBeLessThan(html.indexOf('widget-second'))
  })

  it('lets a widgets:filter listener hide widgets', async () => {
    expect(await $fetch<string>('/')).not.toContain('widget-secret')
  })
})
