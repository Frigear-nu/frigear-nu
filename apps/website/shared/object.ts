type NestedObject = { [key: string]: unknown | NestedObject }
type DottedObject = { [key: string]: unknown }

//  objectGet({ a: { b: 1 } }, 'a.b') === 1
export const objectGet = <T = unknown>(obj: NestedObject, path: string): T | undefined => {
  if (obj == null || !path) return undefined
  return path.split('.').reduce<NestedObject | undefined>(
    (o, i) => (o != null ? (o as NestedObject)[i] as NestedObject : undefined),
    obj,
  ) as T | undefined
}

// objectSet({ a: { b: 1 } }, 'a.b', 2) => { a: { b: 2 } }
export const objectSet = <T extends NestedObject>(obj: T, path: string, value: unknown): T => {
  const keys = path.split('.')
  keys.reduce((o, key, index) => {
    if (index === keys.length - 1) {
      (o as NestedObject)[key] = value
    }
    else {
      if (typeof (o as NestedObject)[key] !== 'object' || (o as NestedObject)[key] === null) {
        (o as NestedObject)[key] = {}
      }
    }
    return (o as NestedObject)[key] as NestedObject
  }, obj as NestedObject)
  return obj
}

// objectDot({ some: { path: true } }, '.') === { 'some.path': true }
export const objectDot = (obj: NestedObject, prefix = '', separator = '.'): DottedObject =>
  Object.entries(obj).reduce<DottedObject>((acc, [key, value]) => {
    const dotKey = prefix ? `${prefix}${separator}${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(acc, objectDot(value as NestedObject, dotKey, separator))
    }
    else {
      acc[dotKey] = value
    }
    return acc
  }, {})

// objectUndot({ 'some.path': true }, '.') === { some: { path: true } }
export const objectUndot = (obj: DottedObject): NestedObject =>
  Object.entries(obj).reduce<NestedObject>((acc, [key, value]) => {
    objectSet(acc, key, value)
    return acc
  }, {})
