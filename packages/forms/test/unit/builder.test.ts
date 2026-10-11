import { describe, expect, it } from 'vitest'
import {
  changeMode, collapseTranslated, createField, dropIndex, expandTranslated, duplicateField, formDefinitionSchema, moveField, moveStep, removeStep, uniqueFieldKey, writeTranslated,
} from '../../src/runtime/utils'
import type { FormDefinition } from '../../src/types'

const base = (): FormDefinition => ({
  mode: 'stepped',
  storage: 'db',
  steps: [
    { id: 'a', fields: [{ key: 'one', type: 'text' }, { key: 'two', type: 'text' }, { key: 'three', type: 'text' }] },
    { id: 'b', fields: [{ key: 'four', type: 'text', showIf: { field: 'one', op: 'truthy' } }] },
  ],
})
const keys = (definition: FormDefinition) => definition.steps.map(step => step.fields.map(field => field.key))

describe('moveField', () => {
  it('reorders inside a step, honouring the drop slot adjustment', () => {
    const from = { step: 0, index: 0 }
    // Dropping "one" in the gap before "three" (slot 2) lands it after "two".
    const moved = moveField(base(), from, { step: 0, index: dropIndex(from, { step: 0, index: 2 }) })
    expect(keys(moved)[0]).toEqual(['two', 'one', 'three'])
  })

  it('moves upwards without adjustment', () => {
    const from = { step: 0, index: 2 }
    expect(keys(moveField(base(), from, { step: 0, index: dropIndex(from, { step: 0, index: 0 }) }))[0]).toEqual(['three', 'one', 'two'])
  })

  it('moves across steps and does not mutate the input', () => {
    const definition = base()
    const moved = moveField(definition, { step: 0, index: 1 }, { step: 1, index: 0 })
    expect(keys(moved)).toEqual([['one', 'three'], ['two', 'four']])
    expect(keys(definition)).toEqual([['one', 'two', 'three'], ['four']])
  })

  it('ignores an invalid source or target', () => {
    const definition = base()
    expect(moveField(definition, { step: 5, index: 0 }, { step: 0, index: 0 })).toBe(definition)
    expect(moveField(definition, { step: 0, index: 0 }, { step: 9, index: 0 })).toBe(definition)
  })
})

describe('steps', () => {
  it('moves steps', () => {
    expect(moveStep(base(), 0, 1).steps.map(step => step.id)).toEqual(['b', 'a'])
  })

  it('removes a step, optionally keeping its fields, and prunes conditions that lost their field', () => {
    const kept = removeStep(base(), 0, { keepFields: true })
    expect(kept.steps).toHaveLength(1)
    const dropped = removeStep(base(), 0)
    expect(dropped.steps[0]!.fields[0]!.showIf).toBeUndefined()
    expect(removeStep(removeStep(base(), 0), 0).steps).toHaveLength(1)
  })

  it('merges into one step when switching to single', () => {
    const single = changeMode(base(), 'single')
    expect(single.steps).toHaveLength(1)
    expect(keys(single)[0]).toEqual(['one', 'two', 'three', 'four'])
    expect(formDefinitionSchema.safeParse(single).success).toBe(true)
  })
})

describe('field creation', () => {
  it('generates unique, valid keys', () => {
    const definition = base()
    expect(uniqueFieldKey(definition, 'one')).toBe('one_2')
    expect(uniqueFieldKey(definition, '1 bad key!')).toBe('bad_key')
  })

  it('creates fields that satisfy the schema', () => {
    for (const type of ['text', 'select', 'radio', 'markdown', 'email'] as const) {
      const definition = base()
      definition.steps[0]!.fields.push(createField(definition, type))
      expect(formDefinitionSchema.safeParse(definition).success, type).toBe(true)
    }
  })

  it('duplicates with a fresh key and without the condition', () => {
    const copy = duplicateField(base(), { step: 1, index: 0 })
    expect(keys(copy)[1]).toEqual(['four', 'four_2'])
    expect(copy.steps[1]!.fields[1]!.showIf).toBeUndefined()
  })
})

describe('writeTranslated', () => {
  it('keeps strings plain and other locales intact', () => {
    expect(writeTranslated('Hi', 'en', 'Hello')).toBe('Hello')
    expect(writeTranslated({ en: 'Hi', da: 'Hej' }, 'da', 'Hejsa')).toEqual({ en: 'Hi', da: 'Hejsa' })
    expect(writeTranslated({ en: 'Hi' }, 'en', '')).toBeUndefined()
  })
})

describe('expand/collapse translated', () => {
  it('turns a plain string into a map for the current locale and back', () => {
    expect(expandTranslated('Hello', 'en')).toEqual({ en: 'Hello' })
    expect(expandTranslated('', 'en')).toBeUndefined()
    expect(expandTranslated({ en: 'Hi' }, 'da')).toEqual({ en: 'Hi' })
    expect(collapseTranslated({ en: 'Hi', da: 'Hej' }, 'da')).toBe('Hej')
    expect(collapseTranslated({ da: 'Hej' }, 'en')).toBe('Hej')
    expect(collapseTranslated('Plain', 'da')).toBe('Plain')
  })
})
