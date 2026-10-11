export default defineEventHandler(async (event) => {
  const { userId } = await readBody<{ userId: number }>(event)
  await authorize(event, editPost, { userId })
  return { ok: true, allowed: await allows(event, editPost, { userId }) }
})
