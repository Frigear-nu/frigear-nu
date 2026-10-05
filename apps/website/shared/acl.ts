export const roleIsHigher = <T>(
  roles: T[] | readonly T[],
  sourceRole: T,
  compareRole: T,
) => {
  if (!sourceRole || !compareRole) return false
  if (!roles.includes(sourceRole) || !roles.includes(compareRole)) return false
  return roles.indexOf(sourceRole) < roles.indexOf(compareRole)
}

export const roleIsHigherOrEqual = <T>(
  roles: T[] | readonly T[],
  sourceRole: T,
  compareRole: T,
) => {
  if (!sourceRole || !compareRole) return false
  if (!roles.includes(sourceRole) || !roles.includes(compareRole)) return false
  return roles.indexOf(sourceRole) <= roles.indexOf(compareRole)
}
