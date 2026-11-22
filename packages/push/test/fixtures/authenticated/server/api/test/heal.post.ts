import { setFakeTokenHealed } from '../../plugins/fake-providers'

// Test-only: makes the fake providers accept `token` (or refuse it again with `healed: false`).
export default defineEventHandler(async (event) => {
  const { token, healed = true } = await readBody<{ token: string, healed?: boolean }>(event)
  setFakeTokenHealed(token, healed)
  return { token, healed }
})
