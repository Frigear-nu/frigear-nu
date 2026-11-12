import type { H3Event } from 'h3'

// Needs a permission, as the route serving the same data would: a token without it gets the rest of the bootstrap.
export default async function events(event: H3Event) {
  const { user } = await authorize(event, 'events:read')
  return [{ id: 'e1', owner: user.id }]
}
