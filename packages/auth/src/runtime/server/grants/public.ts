import { defineGrantKind, publicGrantSchema } from '../../utils/grants'

// The built-in `public` kind: everyone, anonymous callers included. It is the only grant that serves a record without
// sign-in (`grantsCanRead`). It lists nobody: a public audience cannot be enumerated, so a send to it reaches nobody.
export default defineGrantKind('public', {
  schema: publicGrantSchema,
  matches: () => true,
  members: () => [],
})
