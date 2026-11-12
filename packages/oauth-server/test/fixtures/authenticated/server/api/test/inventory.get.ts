// A staff API: `inventory:read`, which an access token only has when staff granted the scope.
export default defineEventHandler(async (event) => {
  await authorize(event, 'inventory:read')
  return { items: ['hammer'] }
})
