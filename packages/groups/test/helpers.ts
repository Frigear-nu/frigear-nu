import { fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'

export async function registerUser(name: string, email: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(200)
  return { cookie: response.headers.get('set-cookie')! }
}
