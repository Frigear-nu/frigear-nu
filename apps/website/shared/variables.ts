export type ValidValue = object | string | number | boolean
type ValidValues = ValidValue | ValidValue[]

type ReplaceVariableValuesFn = <T extends ValidValues>(
  value: T,
  variables: Record<string, ValidValue>,
) => T

export const replaceVariablesInValues: ReplaceVariableValuesFn = <T extends ValidValues>(
  value: T,
  variables: Record<string, ValidValue>,
): T => {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, key) =>
      key in variables ? String(variables[key]) : `\${${key}}`,
    ) as T
  }

  if (Array.isArray(value)) {
    return value.map(item => replaceVariablesInValues(item, variables)) as T
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceVariablesInValues(v, variables)]),
    ) as T
  }

  return value
}
