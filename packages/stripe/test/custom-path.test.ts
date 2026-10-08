import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { eventId, makeEvent, postWebhook } from './helpers'

describe('stripe webhook (custom path)', async () => {
  // NuxtHub KV persists processed event ids on disk, so start every run from a clean slate.
  const dataDir = fileURLToPath(new URL('./fixtures/custom-path/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/custom-path', import.meta.url)),
  })

  it('serves the webhook on the configured path', async () => {
    const response = await postWebhook(makeEvent(eventId('custom'), 'customer.created'), { path: '/hooks/stripe' })
    expect(response.status, await response.clone().text()).toBe(200)
  })

  it('no longer serves the default path', async () => {
    const response = await postWebhook(makeEvent(eventId('custom2'), 'customer.created'))
    // The Nuxt renderer answers unknown paths, but it is not the webhook.
    expect(await response.text()).not.toContain('"received"')
  })
})
