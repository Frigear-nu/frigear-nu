import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'

// Without `forms:pii` only metadata is returned: no answers, no submitter id, no file names.
// File contents are never available through MCP.
export default defineScopedMcpTool({
  description: 'Get one submission (staff). Answers, submitter and file names are only included with the forms:pii permission.',
  permission: 'forms:manage',
  annotations: { readOnlyHint: true },
  inputSchema: { id: z.string() },
  handler: async ({ id }, ctx) => {
    const row = await findSubmissionById(id)
    const files = await db.select().from(schema.formSubmissionFiles).where(eq(schema.formSubmissionFiles.submissionId, row.id))
    const allow = await ctx.can('forms:pii')
    const submission = redactPii({
      ...pick(row, ['id', 'formId', 'formSlug', 'formVersion', 'locale', 'deliveryStatus']),
      createdAt: isoDate(row.createdAt),
      answeredFields: Object.keys(row.answers),
      fileCount: files.length,
      answers: row.answers,
      userId: row.userId,
      files: files.map(toSubmissionFileDto),
    }, { allow, fields: ['answers', 'userId', 'files'] })
    return { notice: piiNotice(allow, 'forms:pii', 'Answers, the submitter and file names'), submission }
  },
})
