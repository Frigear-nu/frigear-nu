import { defineAccess } from '@frigear-nu/auth/access'

// What the authorization module adds to access control, registered in `module.ts` (`registerAccess`). Role changes
// alter what someone may do, so assigning is session only.
export const authorizationAccess = defineAccess('authorization', {
  permissions: {
    'roles:read': { label: 'See roles', description: 'See the roles, what each may do and who has them.' },
    'roles:assign': { label: 'Assign roles', description: 'Give users roles and take them away (only roles within your own permissions).', sessionOnly: true },
  },
})
