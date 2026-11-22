import { defineGrantKind, signedInGrantSchema } from '../../utils/grants'

// The built-in `signed-in` kind: every signed-in user, never an anonymous caller (`matchGrantList` only hands `public`
// grants an anonymous caller). Like `public`, it lists nobody: it stands for every account, so a send to it reaches
// nobody. Send to a role or a team instead.
export default defineGrantKind('signed-in', {
  schema: signedInGrantSchema,
  matches: ({ user }) => !!user,
  members: () => [],
})
