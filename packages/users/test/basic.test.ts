import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { usersApi } from '../src/runtime/utils/api'

describe('ssr', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('renders the index page', async () => {
    // Get response to a server-rendered page with `$fetch`.
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('registers the self-service routes and requires an authenticated session', async () => {
    const anonymous = apiClient()
    await expectApiError(anonymous.json('PATCH', usersApi.me.profile, { name: 'Ada' }), 401)
    await expectApiError(anonymous.json('PUT', usersApi.me.email, { email: 'ada@example.com' }), 401)
    await expectApiError(anonymous.json('PUT', usersApi.me.password, {
      currentPassword: 'current',
      newPassword: 'new-password123',
      confirmNewPassword: 'new-password123',
    }), 401)
  })
})
