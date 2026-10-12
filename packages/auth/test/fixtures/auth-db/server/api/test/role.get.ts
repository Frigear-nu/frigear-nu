// A role-gated route: the role comes from the freshly loaded user, as policy hooks would read it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event) as { role: string }
  if (user.role !== 'admin') throw createError({ statusCode: 403 })
  return { ok: true }
})
