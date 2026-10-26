import type { H3Event } from 'h3'

// Any signed-in caller.
export default async function profile(event: H3Event) {
  const { user } = await requireAuth(event)
  return { id: user.id, name: user.name }
}
