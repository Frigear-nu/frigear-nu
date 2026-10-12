import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { renderAnswers } from '../../../utils/render'

// Answers are what people typed about themselves, so they need the separate `forms:pii` scope.
export default defineScopedMcpTool({
  description: 'List the latest submissions of a form (staff). Answer previews are only included with the forms:pii scope.',
  scopes: ['forms:manage'],
  gate: canManageForms,
  annotations: { readOnlyHint: true },
  inputSchema: { formId: z.string(), limit: z.number().int().min(1).max(200).optional() },
  handler: async ({ formId, limit }, ctx) => {
    const form = await findFormById(formId)
    const rows = await db.select().from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.formId, form.id))
      .orderBy(desc(schema.formSubmissions.createdAt))
      .limit(limit ?? 50)
    const allow = ctx.hasScope('forms:pii')
    const submissions = rows.map(row => redactPii({
      ...pick(row, ['id', 'locale', 'deliveryStatus']),
      createdAt: row.createdAt.toISOString(),
      preview: renderAnswers(row.definitionSnapshot, row.answers, row.locale)
        .filter(answer => answer.value)
        .slice(0, 3)
        .map(({ label, value }) => ({ label, value: value.slice(0, 120) })),
    }, { allow, fields: ['preview'] }))
    return { notice: piiNotice(allow, 'forms:pii', 'Answer previews'), submissions }
  },
})
