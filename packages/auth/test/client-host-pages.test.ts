import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { filesContaining, outputDir } from './utils/output'

describe('client mode: host pages win', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/client-host-pages', import.meta.url)) })

  it('builds the app\'s own /login instead of the module page', () => {
    expect(filesContaining(outputDir('public'), 'Login page of the host app')).not.toEqual([])
    expect(filesContaining(outputDir('public'), 'Sign in with your account to continue.')).toEqual([])
  })

  it('still builds the module callback page', () => {
    expect(filesContaining(outputDir('public'), 'Signing you in…')).not.toEqual([])
  })
})
