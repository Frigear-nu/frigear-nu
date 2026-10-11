// Pure helpers, safe to import from the Vue app as well as Nitro code.
import type { FormDefinition } from '../../types'

export type * from '../../types'

export { translate, interpolate, defaultMessages, newId } from './text'
export type { MessageTranslator, TranslateParams } from './text'
export { evaluateCondition, resolveVisibility, isFieldVisible, isInputField } from './conditions'
export type { Answers, VisibleStep } from './conditions'
export { buildFormSchema, buildFieldSchema, validatedFields } from './schema'
export type { SchemaOptions } from './schema'
export { formDefinitionSchema, parseFormDefinition, resolveEmailDelivery } from './definition'
export type { FormDefinitionInput } from './definition'

/** Typed identity helper for authoring definitions (seed files, tests). */
export function defineForm<const T extends FormDefinition>(definition: T): T {
  return definition
}

export { renderMarkdown } from './markdown'
