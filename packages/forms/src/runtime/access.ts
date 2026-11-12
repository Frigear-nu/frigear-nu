import { defineAccess } from '@frigear-nu/auth/access'

// What the forms module adds to access control, registered in `module.ts` (`registerAccess`).
export const formsAccess = defineAccess('forms', {
  permissions: {
    manage: {
      label: 'Manage forms',
      description: 'Create and edit forms, read their submissions and files, and redeliver them.',
      grantTo: ['admin'],
    },
    pii: {
      label: 'See submission answers',
      description: 'See submission answers and file names (MCP tools). Never covered by a wildcard.',
      sensitive: true,
      grantTo: ['admin'],
    },
    // Minting or removing access credentials (form tokens, passwords, secrets): only a signed-in session, never an API
    // or OAuth token. Roles that grant `forms:manage` by name need to grant this too (`forms:*` covers it).
    credentials: {
      label: 'Manage form access credentials',
      description: 'Create and remove form access tokens, passwords and secrets. Cookie sessions only.',
      sessionOnly: true,
      grantTo: ['admin'],
    },
    submit: { label: 'Submit forms', description: 'Submit forms as you.', implicit: true },
  },
  scopes: {
    forms: { label: 'Submit forms', description: 'Submit forms as you.', icon: 'i-lucide-clipboard-list', permissions: ['forms:submit'] },
  },
})
