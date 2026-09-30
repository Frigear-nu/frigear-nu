import { db } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  return db.query.userCredentials.findMany({
    where: (t, { eq }) => eq(t.userId, user.id),
    columns: { publicKey: false },
  })
})
