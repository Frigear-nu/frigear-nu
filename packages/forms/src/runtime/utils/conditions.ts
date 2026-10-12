import type { Condition, FormDefinition, FormField, FormStep } from '../../types'

export type Answers = Record<string, unknown>

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)

/** Evaluates a `showIf` condition against the answers of the currently visible fields. */
export function evaluateCondition(condition: Condition | undefined, answers: Answers): boolean {
  if (!condition) return true
  const answer = answers[condition.field]
  switch (condition.op) {
    case 'empty':
      return isEmpty(answer)
    case 'notEmpty':
    case 'truthy':
      return !isEmpty(answer)
    case 'eq':
      return answer === condition.value
    case 'neq':
      return answer !== condition.value
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(answer)
    default:
      return true
  }
}

export type VisibleStep = { step: FormStep, index: number, fields: FormField[] }

/**
 * Resolves which steps and fields are visible for the given answers. Fields are walked in
 * definition order and a condition only sees answers of fields that are themselves visible, so a
 * hidden field's stale answer can never keep another field shown. A condition on a field that
 * comes later in the form therefore never matches.
 */
export function resolveVisibility(definition: FormDefinition, answers: Answers): VisibleStep[] {
  const effective: Answers = {}
  const result: VisibleStep[] = []

  definition.steps.forEach((step, index) => {
    if (!evaluateCondition(step.showIf, effective)) return
    const fields: FormField[] = []
    for (const field of step.fields) {
      if (!evaluateCondition(field.showIf, effective)) continue
      fields.push(field)
      if (field.key in answers) effective[field.key] = answers[field.key]
    }
    result.push({ step, index, fields })
  })

  return result
}

export function isFieldVisible(definition: FormDefinition, key: string, answers: Answers): boolean {
  return resolveVisibility(definition, answers).some(({ fields }) => fields.some(field => field.key === key))
}

/** Fields that collect an answer (everything except static `markdown`). */
export const isInputField = (field: FormField) => field.type !== 'markdown'
