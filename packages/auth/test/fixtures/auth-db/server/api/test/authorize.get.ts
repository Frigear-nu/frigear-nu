// `authorize` on the permission in the query: 200 with how it was decided, or its 401/403.
export default defineEventHandler(async (event) => {
  const permission = String(getQuery(event).permission ?? '')
  await authorize(event, permission)
  return { ok: true, via: (await inspect(event, permission)).via }
})
