import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import type { SubmissionDeliveryDto, SubmittedContext } from '../../../../types'

// Runs the `forms:submitted` hooks again for a stored submission (e.g. after a failed email).
export default defineEventHandler(async (event): Promise<SubmissionDeliveryDto> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await findSubmissionById(id)
  const files = await db.select().from(schema.formSubmissionFiles).where(eq(schema.formSubmissionFiles.submissionId, row.id))
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, row.formId)).limit(1)

  const ctx: SubmittedContext = {
    event,
    form: { id: row.formId, slug: row.formSlug, name: form?.name ?? row.formSlug, version: row.formVersion, definition: row.definitionSnapshot },
    answers: row.answers,
    files: files.map(file => ({ fieldKey: file.fieldKey, filename: file.filename, contentType: file.contentType, size: file.size, pathname: file.pathname })),
    locale: row.locale,
    userId: row.userId,
    submissionId: row.id,
    stored: true,
    delivered: false,
  }

  let error: string | undefined
  try {
    await useNitroApp().hooks.callHook('forms:submitted', ctx)
  }
  catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  const deliveryStatus = error ? 'failed' : ctx.delivered ? 'delivered' : 'none'
  await db.update(schema.formSubmissions).set({ deliveryStatus, deliveryError: error ?? null }).where(eq(schema.formSubmissions.id, row.id))
  return { deliveryStatus, deliveryError: error ?? null }
})
