export default defineEventHandler((event) => {
  if (getQuery(event).fail) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return ['alpha', 'beta']
})
