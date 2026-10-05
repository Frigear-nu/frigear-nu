import { describe, expect, it, vi } from 'vitest'
import { createResolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defineNavigationFile, registerNavigationFile } from '../src/runtime/utils/register'

function createNuxt(): Nuxt {
  return { options: {} } as unknown as Nuxt
}

describe('defineNavigationFile', () => {
  it('returns the function unchanged', () => {
    const fn = vi.fn()
    expect(defineNavigationFile(fn)).toBe(fn)
  })
})

describe('registerNavigationFile', () => {
  it('resolves and registers a file path on nuxt.options.navigation._files', async () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)

    await registerNavigationFile(nuxt, { resolver, file: './fixtures/navigation-file' })

    expect(nuxt.options.navigation?._files).toHaveLength(1)
    expect(nuxt.options.navigation!._files![0]).toContain('fixtures/navigation-file')
  })

  it('de-duplicates the same resolved file across multiple registrations', async () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)

    await registerNavigationFile(nuxt, { resolver, file: './fixtures/navigation-file' })
    await registerNavigationFile(nuxt, { resolver, file: './fixtures/navigation-file' })

    expect(nuxt.options.navigation?._files).toHaveLength(1)
  })

  it('accumulates files registered by different modules', async () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)

    await registerNavigationFile(nuxt, { resolver, file: './fixtures/navigation-file' })
    await registerNavigationFile(nuxt, { resolver, file: './fixtures/other-navigation-file' })

    expect(nuxt.options.navigation?._files).toHaveLength(2)
  })
})
