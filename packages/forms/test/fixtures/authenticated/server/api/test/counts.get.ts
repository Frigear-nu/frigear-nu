import { count } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async () => {
  const [submissions] = await db.select({ total: count() }).from(schema.formSubmissions)
  const [files] = await db.select({ total: count() }).from(schema.formSubmissionFiles)
  return { submissions: submissions!.total, files: files!.total }
})
