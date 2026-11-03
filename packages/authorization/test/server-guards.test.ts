import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// Server mode: the server middleware applies the rules to every `/api/` request, Auth's endpoints included.
describe('server mode: guards', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/server-guarded', import.meta.url)) })

  it('keeps login, register, the session fetch and magic-link confirm reachable under `/**`', async () => {
    // Each answers from its own handler (a validation error), not from the guard (401 "Authentication required").
    for (const [path, body] of [
      ['/api/auth/login', {}],
      ['/api/auth/register', {}],
      ['/api/auth/magic-link/confirm', {}],
    ] as const) {
      const response = await post(path, body)
      expect(response.status, `${path}: ${await response.clone().text()}`).toBe(400)
    }
    expect((await fetch('/api/_auth/session')).status).toBe(200)
    expect(await $fetch('/api/_auth/session')).not.toHaveProperty('user')
  })

  it('still guards everything else, and an app rule below an exemption', async () => {
    expect((await fetch('/api/test/private')).status).toBe(401)
    expect((await fetch('/api/auth/me/tokens')).status).toBe(401)
  })
})
