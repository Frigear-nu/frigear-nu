import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Without `forms:pii` only metadata is returned: no answers, no submitter id, no file names.
// File contents are never available through MCP.
export default defineScopedMcpTool({
  description: 'Get one submission (staff). Answers, submitter and file names are only included with the forms:pii scope.',
  scopes: ['forms:manage'],
  gate: canManageForms,
  annotations: { readOnlyHint: true },
  inputSchema: { id: z.string() },
  handler: async ({ id }, ctx) => {
    const [row] = await db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.id, id)).limit(1)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Submission not found.' })
    const files = await db.select().from(schema.formSubmissionFiles).where(eq(schema.formSubmissionFiles.submissionId, row.id))
    const allow = ctx.hasScope('forms:pii')
    const submission = redactPii({
      ...pick(row, ['id', 'formId', 'formSlug', 'formVersion', 'locale', 'deliveryStatus']),
      createdAt: row.createdAt.toISOString(),
      answeredFields: Object.keys(row.answers),
      fileCount: files.length,
      answers: row.answers,
      userId: row.userId,
      files: files.map(({ id, fieldKey, filename, contentType, size }) => ({ id, fieldKey, filename, contentType, size })),
    }, { allow, fields: ['answers', 'userId', 'files'] })
    return { notice: piiNotice(allow, 'forms:pii', 'Answers, the submitter and file names'), submission }
  },
})
