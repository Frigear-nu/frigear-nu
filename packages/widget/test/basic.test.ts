import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('ssr (no registered widgets)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)) })

  it('renders the empty slot', async () => {
    expect(await $fetch('/')).toContain('empty-area')
  })
})
