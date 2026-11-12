// Writes to the session the way `PATCH /api/users/me/profile` does (`setUserSession` merges), for the lifetime tests.
export default defineEventHandler(async (event) => {
  const before = (await getUserSession(event)).signedInAt
  await setUserSession(event, { touchedAt: Date.now() })
  const after = (await getUserSession(event)).signedInAt
  return { before, after }
})
