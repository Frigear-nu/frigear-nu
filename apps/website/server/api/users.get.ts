import { db } from '@nuxthub/db'

export default defineEventHandler(async () => {
  return db.query.users.findMany({
    where: (t, { eq }) => eq(t.locale, 'da'),
  })
})
