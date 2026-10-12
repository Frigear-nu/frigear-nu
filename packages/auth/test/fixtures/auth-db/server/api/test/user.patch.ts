import { deleteTestUser, patchTestUser } from '../../utils/test-users'

export default defineEventHandler(async (event) => {
  const { id, patch, remove } = await readBody<{ id: string, patch?: { role?: string }, remove?: boolean }>(event)
  if (remove) deleteTestUser(String(id))
  else patchTestUser(String(id), patch ?? {})
  return { ok: true }
})
