import { afterEach, describe, expect, it, vi } from 'vitest'
import { addTemplate, addTypeTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { addOptionalImports } from '../src/runtime/utils/imports'

vi.mock('@nuxt/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nuxt/kit')>()
  return {
    ...actual,
    addTemplate: vi.fn(({ filename }: { filename: string }) => ({ dst: `/generated/${filename}` })),
    addTypeTemplate: vi.fn(),
  }
})

afterEach(() => vi.clearAllMocks())

/** Runs `addOptionalImports`, then `modules:done`, and returns the generated module, its type and the aliases. */
async function generate(available: boolean) {
  const hooks: Array<() => Promise<void> | void> = []
  const nuxt = {
    options: { alias: {} as Record<string, string> },
    hook: (name: string, fn: () => Promise<void> | void) => {
      if (name === 'modules:done') hooks.push(fn)
    },
  } as unknown as Nuxt
  let installed = false
  addOptionalImports(nuxt, '#menu/optional', [{
    name: 'queryCollection',
    available: () => installed,
    fallback: '() => { throw new Error(\'not installed\') }',
    fallbackType: '(collection: string) => never',
  }])
  // Installed after the call, like a module set up later: only the state once every module is done counts.
  installed = available
  for (const hook of hooks) await hook()

  const template = vi.mocked(addTemplate).mock.calls[0]![0] as { filename: string, getContents: () => string }
  const types = vi.mocked(addTypeTemplate).mock.calls[0]![0] as { filename: string, getContents: () => string }
  return { nuxt, module: template.getContents(), filename: template.filename, types: types.getContents() }
}

describe('addOptionalImports', () => {
  it('re-exports the auto-import when its module is installed', async () => {
    const { nuxt, module, filename, types } = await generate(true)
    expect(filename).toBe('menu/optional.mjs')
    expect(nuxt.options.alias['#menu/optional']).toBe('/generated/menu/optional.mjs')
    expect(module).toBe('export { queryCollection } from \'#imports\'\n')
    expect(types).toContain('export { queryCollection } from \'#imports\'')
  })

  it('exports the stand-in when it is not', async () => {
    const { module, types } = await generate(false)
    expect(module).toBe('export const queryCollection = () => { throw new Error(\'not installed\') }\n')
    expect(types).toContain('export const queryCollection: (collection: string) => never')
  })
})
