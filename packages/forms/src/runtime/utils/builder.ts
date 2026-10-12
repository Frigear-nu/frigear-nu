import type { FieldType, FormDefinition, FormDelivery, FormStorage, FormField, FormStep, Translated } from '../../types'

/** Where a field sits in a definition. */
export type FieldPosition = { step: number, index: number }

/** Field types in the order the builder palette lists them. */
export const fieldTypes: FieldType[] = ['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'radio', 'checkbox', 'file', 'markdown']

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max))

/** Moves an item inside an array (returns a new array). `to` is the index in the resulting array. */
export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(clamp(to, next.length), 0, item!)
  return next
}

/**
 * Moves a field to another position, possibly into another step. `to.index` is the index in the
 * target step *after* the field was taken out of its old place, which is what a drop indicator
 * "between two rows" naturally yields once adjusted by `dropIndex`.
 */
export function moveField(definition: FormDefinition, from: FieldPosition, to: FieldPosition): FormDefinition {
  const source = definition.steps[from.step]?.fields[from.index]
  if (!source || !definition.steps[to.step]) return definition

  const steps = definition.steps.map(step => ({ ...step, fields: [...step.fields] }))
  steps[from.step]!.fields.splice(from.index, 1)
  steps[to.step]!.fields.splice(clamp(to.index, steps[to.step]!.fields.length), 0, source)
  return { ...definition, steps }
}

/**
 * The insertion index to hand to `moveField` for a drop "before the row at `slot`" (a gap number
 * counted in the target step *before* removal): dragging downwards inside the same step shifts
 * everything above the slot up by one.
 */
export function dropIndex(from: FieldPosition | undefined, to: FieldPosition): number {
  return from && from.step === to.step && from.index < to.index ? to.index - 1 : to.index
}

export function moveStep(definition: FormDefinition, from: number, to: number): FormDefinition {
  return { ...definition, steps: arrayMove(definition.steps, from, to) }
}

export function insertField(definition: FormDefinition, at: FieldPosition, field: FormField): FormDefinition {
  if (!definition.steps[at.step]) return definition
  const steps = definition.steps.map(step => ({ ...step, fields: [...step.fields] }))
  steps[at.step]!.fields.splice(clamp(at.index, steps[at.step]!.fields.length), 0, field)
  return { ...definition, steps }
}

export function removeField(definition: FormDefinition, at: FieldPosition): FormDefinition {
  if (!definition.steps[at.step]?.fields[at.index]) return definition
  const steps = definition.steps.map(step => ({ ...step, fields: [...step.fields] }))
  steps[at.step]!.fields.splice(at.index, 1)
  return { ...definition, steps }
}

export function updateField(definition: FormDefinition, at: FieldPosition, patch: Partial<FormField>): FormDefinition {
  if (!definition.steps[at.step]?.fields[at.index]) return definition
  const steps = definition.steps.map((step, stepIndex) => stepIndex === at.step
    ? { ...step, fields: step.fields.map((field, index) => index === at.index ? { ...field, ...patch } : field) }
    : step)
  return { ...definition, steps }
}

export function updateStep(definition: FormDefinition, index: number, patch: Partial<FormStep>): FormDefinition {
  if (!definition.steps[index]) return definition
  return { ...definition, steps: definition.steps.map((step, i) => i === index ? { ...step, ...patch } : step) }
}

/** Every field key of the definition (markdown blocks included). */
export function allFieldKeys(definition: FormDefinition): Set<string> {
  return new Set(definition.steps.flatMap(step => step.fields.map(field => field.key)))
}

function uniqueName(taken: Set<string>, base: string, separator: string): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${separator}${n}`)) n++
  return `${base}${separator}${n}`
}

/** A field key that is valid and not used yet, e.g. `text`, `text_2`, `text_3`. */
export function uniqueFieldKey(definition: FormDefinition, base: string): string {
  const clean = base.replace(/\W+/g, '_').replace(/^[^a-z]+/i, '').replace(/_+$/, '') || 'field'
  return uniqueName(allFieldKeys(definition), clean, '_')
}

export function uniqueStepId(definition: FormDefinition, base = 'step'): string {
  return uniqueName(new Set(definition.steps.map(step => step.id)), base, '-')
}

/** A new field of the given type with sensible defaults. */
export function createField(definition: FormDefinition, type: FieldType): FormField {
  const field: FormField = { key: uniqueFieldKey(definition, type), type }
  if (type === 'markdown') field.content = 'Text'
  else field.label = 'Untitled'
  if (type === 'select' || type === 'radio') {
    field.options = [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }]
  }
  if (type === 'email') field.autocomplete = 'email'
  return field
}

export function createStep(definition: FormDefinition): FormStep {
  const id = uniqueStepId(definition)
  return { id, title: `Step ${definition.steps.length + 1}`, fields: [] }
}

export function duplicateField(definition: FormDefinition, at: FieldPosition): FormDefinition {
  const field = definition.steps[at.step]?.fields[at.index]
  if (!field) return definition
  const copy = structuredClone(field)
  copy.key = uniqueFieldKey(definition, field.key)
  delete copy.showIf
  return insertField(definition, { step: at.step, index: at.index + 1 }, copy)
}

/** Removes `showIf`s, routes, reply-to and `keep` entries that point at a field that no longer exists. */
export function pruneReferences(definition: FormDefinition): FormDefinition {
  const keys = allFieldKeys(definition)
  const seen = new Set<string>()
  const ok = (condition: { field: string } | undefined) => !condition || seen.has(condition.field)

  const steps = definition.steps.map((step) => {
    const stepOk = ok(step.showIf)
    const fields = step.fields.map((field) => {
      const keep = ok(field.showIf)
      if (field.type !== 'markdown') seen.add(field.key)
      if (keep) return field
      const { showIf: _dropped, ...rest } = field
      return rest
    })
    if (stepOk) return { ...step, fields }
    const { showIf: _dropped, ...rest } = step
    return { ...rest, fields }
  })

  const next: FormDefinition = { ...definition, steps }
  const email = definition.delivery?.email
  if (email) {
    const { routes, replyToField, ...rest } = email
    next.delivery = {
      ...definition.delivery,
      email: {
        ...rest,
        ...(routes && seen.has(routes.field) ? { routes } : {}),
        ...(replyToField && keys.has(replyToField) ? { replyToField } : {}),
      },
    }
  }
  const resubmit = definition.submit?.allowResubmit
  if (resubmit) next.submit = { ...definition.submit, allowResubmit: { keep: resubmit.keep.filter(key => keys.has(key)) } }
  return next
}

/** Switching to `single` merges every step into one; switching to `stepped` keeps the steps as they are. */
export function changeMode(definition: FormDefinition, mode: FormDefinition['mode']): FormDefinition {
  if (mode === definition.mode) return definition
  if (mode === 'stepped') return { ...definition, mode }
  const first = definition.steps[0] ?? { id: 'main', fields: [] }
  const { showIf: _dropped, ...rest } = first
  return pruneReferences({ ...definition, mode, steps: [{ ...rest, fields: definition.steps.flatMap(step => step.fields) }] })
}

/** Deletes a step; its fields move to the previous step (or the next one) so no answer field is lost silently. */
export function removeStep(definition: FormDefinition, index: number, { keepFields = false } = {}): FormDefinition {
  if (definition.steps.length <= 1 || !definition.steps[index]) return definition
  const removed = definition.steps[index]!
  const steps = definition.steps.filter((_, i) => i !== index).map(step => ({ ...step, fields: [...step.fields] }))
  if (keepFields) steps[Math.max(0, index - 1)]!.fields.push(...removed.fields)
  return pruneReferences({ ...definition, steps })
}

/** Reads the text for one locale out of a translatable value. */
export function readTranslated(value: Translated | undefined, locale: string): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? ''
}

/** Writes the text for one locale; plain strings stay plain, per-locale maps keep their other locales. */
export function writeTranslated(value: Translated | undefined, locale: string, text: string): Translated | undefined {
  if (value && typeof value === 'object') {
    const next = Object.fromEntries(Object.entries({ ...value, [locale]: text }).filter(([, entry]) => entry))
    return Object.keys(next).length ? next : undefined
  }
  return text || undefined
}

/** A plain string becomes a per-locale map holding that text for `locale`. */
export function expandTranslated(value: Translated | undefined, locale: string): Translated | undefined {
  if (typeof value !== 'string') return value
  return value ? { [locale]: value } : undefined
}

/** A per-locale map becomes one plain string: the text of `locale`, else `en`, else the first one written. */
export function collapseTranslated(value: Translated | undefined, locale: string): Translated | undefined {
  if (!value || typeof value === 'string') return value
  return value[locale] || value.en || Object.values(value).find(Boolean) || undefined
}

type EmailDelivery = NonNullable<FormDelivery['email']>

const cleanAddresses = (to: readonly string[]) => [...new Set(to.map(address => address.trim()).filter(Boolean))]

/** Replaces `delivery.email`; `undefined` removes it (and an emptied `delivery`). */
function withEmail(definition: FormDefinition, email: EmailDelivery | undefined): FormDefinition {
  const { delivery: _dropped, ...rest } = definition
  const delivery = { ...definition.delivery }
  if (email) delivery.email = email
  else delete delivery.email
  return Object.keys(delivery).length ? { ...rest, delivery } : rest
}

/** Sets the default recipients. An empty list switches email delivery off and drops its subject, reply-to and routes. */
export function setEmailRecipients(definition: FormDefinition, to: readonly string[]): FormDefinition {
  const addresses = cleanAddresses(to)
  if (!addresses.length) return withEmail(definition, undefined)
  return withEmail(definition, { ...definition.delivery?.email, to: addresses })
}

/** Patches subject / reply-to of an existing email delivery (no-op without recipients); `undefined` values are removed. */
export function patchEmailDelivery(definition: FormDefinition, patch: Partial<Pick<EmailDelivery, 'subject' | 'replyToField'>>): FormDefinition {
  const email = definition.delivery?.email
  if (!email) return definition
  const merged = { ...email, ...patch }
  const { subject, replyToField, ...rest } = merged
  return withEmail(definition, { ...rest, ...(subject ? { subject } : {}), ...(replyToField ? { replyToField } : {}) })
}

/** Chooses the field whose answer routes the email; `undefined` removes all routes. Switching the field starts with no routes. */
export function setRouteField(definition: FormDefinition, field: string | undefined): FormDefinition {
  const email = definition.delivery?.email
  if (!email) return definition
  const { routes, ...rest } = email
  if (!field) return withEmail(definition, rest)
  return withEmail(definition, { ...rest, routes: routes?.field === field ? routes : { field, to: {} } })
}

/** Sets the recipients for one answer value of the route field; an empty list removes that route. */
export function setRoute(definition: FormDefinition, value: string, to: readonly string[]): FormDefinition {
  const email = definition.delivery?.email
  if (!email?.routes) return definition
  const addresses = cleanAddresses(to)
  const routed = Object.fromEntries(Object.entries(email.routes.to).filter(([key]) => key !== value))
  if (addresses.length) routed[value] = addresses
  return withEmail(definition, { ...email, routes: { field: email.routes.field, to: routed } })
}

export function setStorage(definition: FormDefinition, storage: FormStorage): FormDefinition {
  return definition.storage === storage ? definition : { ...definition, storage }
}

/** Problems of a storage choice: file fields cannot work without storage, and a form that neither stores nor emails loses its answers. */
export function storageWarnings(definition: FormDefinition): { files: boolean, lost: boolean } {
  if (definition.storage !== 'none') return { files: false, lost: false }
  return {
    files: definition.steps.some(step => step.fields.some(field => field.type === 'file')),
    lost: !definition.delivery?.email,
  }
}

/** Email-type fields that can serve as the reply-to address. */
export function emailFieldKeys(definition: FormDefinition): string[] {
  return definition.steps.flatMap(step => step.fields.filter(field => field.type === 'email').map(field => field.key))
}

/** Select / radio fields whose answer can route the email. */
export function routableFields(definition: FormDefinition): FormField[] {
  return definition.steps.flatMap(step => step.fields.filter(field => (field.type === 'select' || field.type === 'radio') && field.options?.length))
}
