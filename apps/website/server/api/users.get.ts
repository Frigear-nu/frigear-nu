import { db } from '@nuxthub/db'

export default defineEventHandler(async () => {
  return db.query.users.findMany()
})
