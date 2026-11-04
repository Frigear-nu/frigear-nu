// Always 401, for the server-mode `$api` test.
export default defineEventHandler(() => {
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
})
