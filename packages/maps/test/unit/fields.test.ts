import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cleanPropertyValues, initialPropertyValues, propertyFields } from '../../src/runtime/utils/fields'
import { propertyMeta, translatedProperty } from '../../src/runtime/utils/properties'
import marker from '../../src/runtime/properties/marker'
import area from '../../src/runtime/properties/area'
import label from '../../src/runtime/properties/label'

describe('propertyFields', () => {
  const schema = z.object({
    name: z.string().min(2).max(40).meta({ label: { da: 'Navn', en: 'Name' }, help: 'Shown on the map' }),
    capacity: z.number().int().min(0).max(50),
    ratio: z.number().optional(),
    staffed: z.boolean(),
    level: z.enum(['basic', 'advanced']).default('basic'),
    note: translatedProperty({ label: 'Note' }).optional(),
    tags: z.array(z.string()).optional(),
  })

  it('maps string, number, boolean, enum, optional, default and translated', () => {
    const fields = propertyFields(schema)
    expect(fields.map(field => [field.key, field.type, field.required])).toEqual([
      ['name', 'string', true],
      ['capacity', 'number', true],
      ['ratio', 'number', false],
      ['staffed', 'boolean', true],
      ['level', 'enum', false],
      ['note', 'translated', false],
      ['tags', 'unsupported', false],
    ])
    expect(fields[0]).toMatchObject({ label: { da: 'Navn', en: 'Name' }, help: 'Shown on the map', min: 2, max: 40 })
    expect(fields[1]).toMatchObject({ integer: true, min: 0, max: 50 })
    expect(fields[4]).toMatchObject({ options: ['basic', 'advanced'], defaultValue: 'basic' })
    expect(fields[5]).toMatchObject({ label: 'Note' })
  })

  it('gives no fields for a schema that is not an object', () => {
    expect(propertyFields(z.string())).toEqual([])
    expect(propertyFields(undefined)).toEqual([])
  })

  it('reads the built-in feature kinds', () => {
    expect(propertyFields(marker).map(field => field.type)).toEqual(['translated'])
    expect(propertyFields(area).map(field => field.type)).toEqual(['translated', 'enum'])
    expect(propertyFields(label)[0]).toMatchObject({ key: 'size', type: 'enum', defaultValue: 'medium' })
  })

  it('starts new features with defaults and required booleans off', () => {
    expect(initialPropertyValues(propertyFields(schema))).toEqual({ staffed: false, level: 'basic' })
  })

  it('cleans empty optional values and number text before sending', () => {
    const fields = propertyFields(schema)
    expect(cleanPropertyValues(fields, { name: 'Post', capacity: '4', ratio: '', staffed: true, note: { da: '', en: ' ' }, tags: ['a'], extra: 1 }))
      .toEqual({ name: 'Post', capacity: 4, staffed: true, tags: ['a'], extra: 1 })
  })
})

describe('translatedProperty', () => {
  it('accepts a string or a locale map and is marked for the editor', () => {
    const schema = translatedProperty()
    expect(schema.safeParse('Bar').success).toBe(true)
    expect(schema.safeParse({ da: 'Bar', en: 'Bar' }).success).toBe(true)
    expect(schema.safeParse(3).success).toBe(false)
    expect(propertyMeta(schema.optional()).mapsType).toBe('translated')
  })
})
