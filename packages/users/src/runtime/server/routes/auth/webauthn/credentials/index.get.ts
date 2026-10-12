import { db } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })

  return db.query.userCredentials.findMany({
    where: (t, { eq }) => eq(t.userId, user.id),
    columns: { publicKey: false },
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
})
