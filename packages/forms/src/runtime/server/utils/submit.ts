import type { H3Event } from 'h3'
import { z } from 'zod'
import { apiError, validationError } from '@frigear-nu/module-kit/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'
import type { DeliveredContext, FileDescriptor, FormDefinition, SubmittedContext, SubmittedFile } from '../../../types'
import { buildFormSchema, newId, resolveAccess, resolveCaptcha, validatedFields } from '../../utils'

type Upload = { filename: string, type: string, data: Uint8Array }
type FormRow = typeof schema.forms.$inferSelect
/** A submission body that is already parsed (MCP tools pass answers as arguments instead of a request body). */
export type SubmissionBody = { answers: Record<string, unknown>, locale: string, uploads: Map<string, Upload[]> }

const safeFilename = (name: string) => name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'

/** A BCP 47-ish locale tag (`en`, `da`, `en-GB`, `zh-Hant-TW`), as every submission path (HTTP, MCP) accepts it. */
export const submissionLocale = z.string().trim().max(20).regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i, 'Invalid locale.')

/** The JSON submission body. `answers` is checked against the form's definition afterwards. */
const submissionBodySchema = z.object({
  answers: z.record(z.string(), z.unknown()).default({}),
  locale: submissionLocale.default('en'),
}).prefault({})

/**
 * Reads the submission body: `multipart/form-data` with an `answers` JSON part, an optional
 * `locale` part and one `file:<key>` part per uploaded file, or a plain JSON body
 * `{ answers, locale }` for forms without files. Either shape is validated with `submissionBodySchema`
 * (400 "Validation Error" with the zod issues in `data.issues` when it does not match).
 */
async function readSubmission(event: H3Event): Promise<SubmissionBody> {
  const uploads = new Map<string, Upload[]>()
  const contentType = getRequestHeader(event, 'content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event) ?? []
    let answers: unknown = {}
    let locale: string | undefined
    for (const part of parts) {
      if (part.name === 'answers') {
        try {
          answers = JSON.parse(part.data.toString('utf8'))
        }
        catch {
          throw validationError([{ path: ['answers'], message: 'Invalid answers.' }])
        }
      }
      else if (part.name === 'locale') {
        locale = part.data.toString('utf8')
      }
      else if (part.name?.startsWith('file:') && part.filename) {
        const key = part.name.slice(5)
        uploads.set(key, [...(uploads.get(key) ?? []), { filename: part.filename, type: part.type ?? 'application/octet-stream', data: part.data }])
      }
    }
    return { ...parseSubmissionBody({ answers, locale }), uploads }
  }

  // Not `readValidatedBody`: its 400 carries the zod error only as a message string, and clients need the issues.
  return { ...parseSubmissionBody(await readBody(event)), uploads }
}

/** `submissionBodySchema`, failing with the toolkit's 400 `validation_failed` and the issues in `data.issues`. */
function parseSubmissionBody(input: unknown) {
  const parsed = submissionBodySchema.safeParse(input)
  if (!parsed.success) throw validationError(toIssues(parsed.error.issues))
  return parsed.data
}

/** The issues of a failed submission, as `{ path, message }` (what `FormRenderer` maps onto its fields). */
const toIssues = (issues: readonly { path: PropertyKey[], message: string }[]) =>
  issues.map(issue => ({ path: issue.path.map(segment => typeof segment === 'symbol' ? String(segment) : segment), message: issue.message }))

/** Validates and processes one submission for a published form. */
export async function processSubmission(event: H3Event, form: FormRow, userId: number | null, body?: SubmissionBody) {
  const definition: FormDefinition = form.definition
  const { answers: raw, locale, uploads } = body ?? await readSubmission(event)

  // File answers are descriptors of what was actually uploaded, never what the client claims.
  const answers: Record<string, unknown> = { ...raw }
  for (const field of validatedFields(definition, raw)) {
    if (field.type !== 'file') continue
    const files = uploads.get(field.key) ?? []
    answers[field.key] = files.map((file): FileDescriptor => ({ name: file.filename, size: file.data.byteLength, type: file.type }))
  }

  // Submissions with a valid API token are automated by design and skip the captcha (access.auth is already enforced).
  const skipCaptcha = resolveAccess(definition).auth === 'token'
  const parsed = buildFormSchema(definition, answers, { locale, skipCaptcha }).safeParse(answers)
  if (!parsed.success) {
    throw validationError(toIssues(parsed.error.issues))
  }
  const validated = parsed.data as Record<string, unknown>

  // Verify before anything is stored or delivered; the token itself is never kept.
  for (const field of validatedFields(definition, raw).filter(f => f.type === 'captcha')) {
    const token = validated[field.key]
    Reflect.deleteProperty(validated, field.key)
    Reflect.deleteProperty(answers, field.key)
    if (skipCaptcha) continue
    if (!await verifyCaptcha(event, resolveCaptcha(field, useRuntimeConfig(event).public.forms?.captcha?.defaultProvider).provider, String(token), form.id)) {
      throw validationError([{ path: [field.key], message: 'Captcha verification failed. Please try again.' }])
    }
  }

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
    throw apiError(502, 'delivery_failed', 'The submission could not be delivered.')
  }

  if (ctx.delivered || error) {
    const result: DeliveredContext = { submissionId, formSlug: form.slug, status: error ? 'failed' : 'delivered', error }
    await hooks.callHook('forms:delivered', result)
  }

  return { ok: true as const, id: submissionId }
}
