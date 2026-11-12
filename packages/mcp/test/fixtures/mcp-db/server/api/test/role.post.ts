import { setTestUserRole } from '../../utils/test-users'

export default defineEventHandler(async (event) => {
  const { id, role } = await readBody<{ id: string, role: string }>(event)
  setTestUserRole(String(id), role)
  return { ok: true }
})
