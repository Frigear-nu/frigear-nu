import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'

// Test-only: the raw stored column of every form_secrets row (bypassing decryption).
export default defineEventHandler(() => db.all<{ formId: string, secrets: string }>(sql`select formId, secrets from form_secrets`))
