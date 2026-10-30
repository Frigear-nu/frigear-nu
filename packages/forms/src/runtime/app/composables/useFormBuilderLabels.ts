import type { FieldType, FormField } from '../../../types'
import { translate } from '../../utils'
import { useFormsLocale } from './useForms'
import { useModuleT } from '#imports'

/** Icon per field type, shown in the builder canvas and the insertion menus. */
export const fieldTypeIcons: Record<FieldType, string> = {
  text: 'i-lucide-text-cursor-input',
  textarea: 'i-lucide-align-left',
  email: 'i-lucide-mail',
  tel: 'i-lucide-phone',
  number: 'i-lucide-hash',
  date: 'i-lucide-calendar',
  select: 'i-lucide-list',
  radio: 'i-lucide-circle-dot',
  checkbox: 'i-lucide-square-check',
  file: 'i-lucide-paperclip',
  markdown: 'i-lucide-type',
  captcha: 'i-lucide-shield-check',
}

const fieldTypeNames: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  email: 'Email',
  tel: 'Phone',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  radio: 'Single choice',
  checkbox: 'Checkbox',
  file: 'File upload',
  markdown: 'Text block',
  captcha: 'Captcha',
}

/** Translated field type names and the one-line canvas summary of a field. */
export function useFormBuilderLabels() {
  const t = useModuleT('forms')
  const locale = useFormsLocale()

  const typeLabel = (type: FieldType) => t(`builder.types.${type}`, fieldTypeNames[type])

  // One short line for the canvas: markdown blocks can be paragraphs long.
  const summary = (field: FormField) => {
    const text = translate(field.type === 'markdown' ? field.content : field.label, locale.value)
      || (field.type === 'captcha' ? typeLabel('captcha') : field.key)
    const line = text.replace(/[*_`#>~[]|\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line
  }

  return { typeLabel, summary }
}
