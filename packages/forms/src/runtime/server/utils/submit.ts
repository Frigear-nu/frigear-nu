import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'
import type { DeliveredContext, FileDescriptor, FormDefinition, SubmittedContext, SubmittedFile } from '../../../types'
import { buildFormSchema, newId, validatedFields } from '../../utils'

type Upload = { filename: string, type: string, data: Uint8Array }
type FormRow = typeof schema.forms.$inferSelect

const safeFilename = (name: string) => name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'

/**
 * Reads the submission body: `multipart/form-data` with an `answers` JSON part, an optional
 * `locale` part and one `file:<key>` part per uploaded file, or a plain JSON body
 * `{ answers, locale }` for forms without files.
 */
async function readSubmission(event: H3Event): Promise<{ answers: Record<string, unknown>, locale: string, uploads: Map<string, Upload[]> }> {
  const uploads = new Map<string, Upload[]>()
  const contentType = getRequestHeader(event, 'content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event) ?? []
    let answers: Record<string, unknown> = {}
    let locale = 'en'
    for (const part of parts) {
      if (part.name === 'answers') {
        try {
          answers = JSON.parse(part.data.toString('utf8'))
        }
        catch {
          throw createError({ statusCode: 400, statusMessage: 'Invalid answers.' })
        }
      }
      else if (part.name === 'locale') {
        locale = part.data.toString('utf8').slice(0, 20)
      }
      else if (part.name?.startsWith('file:') && part.filename) {
        const key = part.name.slice(5)
        uploads.set(key, [...(uploads.get(key) ?? []), { filename: part.filename, type: part.type ?? 'application/octet-stream', data: part.data }])
      }
    }
    return { answers, locale, uploads }
  }

  const body = await readBody<{ answers?: Record<string, unknown>, locale?: string }>(event)
  return { answers: body?.answers ?? {}, locale: String(body?.locale ?? 'en').slice(0, 20), uploads }
}

/** Validates and processes one submission for a published form. */
export async function processSubmission(event: H3Event, form: FormRow, userId: number | null) {
  const definition: FormDefinition = form.definition
  const { answers: raw, locale, uploads } = await readSubmission(event)

  // File answers are descriptors of what was actually uploaded, never what the client claims.
  const answers: Record<string, unknown> = { ...raw }
  for (const field of validatedFields(definition, raw)) {
    if (field.type !== 'file') continue
    const files = uploads.get(field.key) ?? []
    answers[field.key] = files.map((file): FileDescriptor => ({ name: file.filename, size: file.data.byteLength, type: file.type }))
  }

  const parsed = buildFormSchema(definition, answers, { locale }).safeParse(answers)
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Invalid submission.',
      data: { issues: parsed.error.issues.map(issue => ({ path: issue.path, message: issue.message })) },
    })
  }
  const validated = parsed.data as Record<string, unknown>

  const stored = definition.storage !== 'none'
  const submissionId = stored ? newId('fsb') : null
  const files: SubmittedFile[] = []

  if (stored) {
    for (const field of validatedFields(definition, answers)) {
      if (field.type !== 'file') continue
      for (const upload of uploads.get(field.key) ?? []) {
        const saved = await blob.put(safeFilename(upload.filename), upload.data, {
          contentType: upload.type,
          prefix: `forms/${form.slug}/${submissionId}/${field.key}`,
          addRandomSuffix: true,
        })
        files.push({ fieldKey: field.key, filename: upload.filename, contentType: upload.type, size: upload.data.byteLength, pathname: saved.pathname })
      }
    }

    await db.insert(schema.formSubmissions).values({
      id: submissionId!,
      formId: form.id,
      formSlug: form.slug,
      formVersion: form.version,
      definitionSnapshot: definition,
      answers: validated,
      userId,
      locale,
      deliveryStatus: 'pending',
    })
    if (files.length) {
      await db.insert(schema.formSubmissionFiles).values(files.map(file => ({
        id: newId('fsf'),
        submissionId: submissionId!,
        fieldKey: file.fieldKey,
        pathname: file.pathname!,
        filename: file.filename,
        contentType: file.contentType,
        size: file.size,
      })))
    }
  }

  const ctx: SubmittedContext = {
    event,
    form: { id: form.id, slug: form.slug, name: form.name, version: form.version, definition },
    answers: validated,
    files,
    locale,
    userId,
    submissionId,
    stored,
    delivered: false,
  }

  const hooks = useNitroApp().hooks
  let error: string | undefined
  try {
    await hooks.callHook('forms:submitted', ctx)
  }
  catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
    console.error(`[forms] delivery of "${form.slug}" failed:`, cause)
  }

  if (stored) {
    await db.update(schema.formSubmissions).set({
      deliveryStatus: error ? 'failed' : ctx.delivered ? 'delivered' : 'none',
      deliveryError: error ?? null,
    }).where(eq(schema.formSubmissions.id, submissionId!))
  }
  else if (error) {
    // Nothing else keeps the answers, so the visitor has to be told and can try again.
    throw createError({ statusCode: 502, statusMessage: 'The submission could not be delivered.' })
  }

  if (ctx.delivered || error) {
    const result: DeliveredContext = { submissionId, formSlug: form.slug, status: error ? 'failed' : 'delivered', error }
    await hooks.callHook('forms:delivered', result)
  }

  return { ok: true as const, id: submissionId }
}
