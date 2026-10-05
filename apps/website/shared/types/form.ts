// shared/types/form.ts
import type { ZodType } from 'zod/v4'
import type { SelectItem, RadioGroupItem, InputMenuItem } from '@nuxt/ui'

type TranslationValue = string | Record<'da' | 'en', string>

export type FormFieldMeta = {
  [key: string]: TranslationValue | string | boolean | undefined
  autocomplete?: string
  hint?: TranslationValue
  content?: TranslationValue
  accept?: string
  multiple?: boolean
}

type BaseField = {
  name: string
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  isArray?: boolean
  meta?: FormFieldMeta
}

export type MarkdownValueField = BaseField & {
  type: 'markdown-value'
  meta?: FormFieldMeta & {
    content: TranslationValue
  }
}

export type TextField = BaseField & {
  type: 'text' | 'email' | 'password'
}

export type NumberField = BaseField & {
  type: 'number'
}

export type TextareaField = BaseField & {
  type: 'textarea'
  rows?: number
}

export type SelectField = BaseField & {
  type: 'select'
  options: SelectItem[]
}

export type ComboboxField = BaseField & {
  type: 'combobox'
  options: InputMenuItem[]
}

export type RadioField = BaseField & {
  type: 'radio'
  options: RadioGroupItem[]
}

export type CheckboxField = BaseField & {
  type: 'checkbox'
}

export type DateField = BaseField & {
  type: 'date'
  minValue?: string
  maxValue?: string
}

export type DateTimeField = BaseField & {
  type: 'datetime'
  minValue?: string
  maxValue?: string
}

export type FileField = BaseField & {
  type: 'file'
  meta?: FormFieldMeta & {
    accept?: string
    multiple?: boolean
  }
}

export type FormFieldDef
  = | MarkdownValueField
    | TextField
    | NumberField
    | TextareaField
    | SelectField
    | ComboboxField
    | RadioField
    | CheckboxField
    | DateField
    | DateTimeField
    | FileField

export type FormStep<TSchema extends ZodType = ZodType> = {
  id: string
  icon?: string
  labelKey?: string
  descriptionKey?: string
  schema: TSchema
  fields?: FormFieldDef[]
  hint?: TranslationValue | { content: TranslationValue, icon?: string }
}

export type SteppedForm<TSteps extends FormStep[]> = {
  id: string
  steps: TSteps
}

type UnionToIntersection<U>
  = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ExtractObjectShape<T>
  = T extends ZodType<infer Shape>
    ? Shape extends Record<string, unknown>
      ? Shape
      : never
    : never

export type UnionFormSteps<TSteps extends FormStep[]>
  = UnionToIntersection<ExtractObjectShape<TSteps[number]['schema']>> extends Record<string, unknown>
    ? UnionToIntersection<ExtractObjectShape<TSteps[number]['schema']>>
    : Record<string, unknown>
