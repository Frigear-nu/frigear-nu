// Pure helpers, safe to import from the Vue app as well as Nitro code.
import type { FormDefinition } from '../../types'

export type * from '../../types'

export { translate, interpolate, defaultMessages, newId } from './text'
export type { MessageTranslator, TranslateParams } from './text'
export { evaluateCondition, resolveVisibility, isFieldVisible, isInputField } from './conditions'
export type { Answers, VisibleStep } from './conditions'
export { buildFormSchema, buildFieldSchema, validatedFields } from './schema'
export type { SchemaOptions } from './schema'
export {
  fieldTypes, arrayMove, moveField, moveStep, dropIndex, insertField, insertStep, removeField, updateField, updateStep, duplicateField,
  createField, createStep, removeStep, changeMode, pruneReferences, allFieldKeys, uniqueFieldKey, uniqueStepId, readTranslated, writeTranslated, expandTranslated, collapseTranslated,
  setEmailRecipients, patchEmailDelivery, setRouteField, setRoute, setStorage, setAccess, storageWarnings, emailFieldKeys, routableFields,
} from './builder'
export type { FieldPosition } from './builder'
export { formDefinitionSchema, accessSchema, defaultAccess, resolveAccess, parseFormDefinition, resolveEmailDelivery } from './definition'
export type { FormDefinitionInput } from './definition'

/** Typed identity helper for authoring definitions (seed files, tests). */
export function defineForm<const T extends FormDefinition>(definition: T): T {
  return definition
}

export { renderMarkdown } from './markdown'
export { previewPayload, previewScale, PREVIEW_WIDTHS } from './preview'
export type { PreviewDevice } from './preview'
