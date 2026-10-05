import { defineAbility } from 'nuxt-authorization/utils'
import type { Users } from '@nuxthub/db/schema'

const allowedRoles: Users['role'][] = ['admin', 'manager', 'coordinator']

export const canViewForms = defineAbility((user: Users) => {
  return allowedRoles.includes(user.role)
})

export const canViewFormSubmissions = defineAbility((user: Users) => {
  return allowedRoles.includes(user.role)
})
