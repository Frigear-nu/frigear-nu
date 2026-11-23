import { defineAccess } from '@frigear-nu/auth/access'

// What the admin module adds to access control: the default `settings.permission`, registered in `module.ts` when
// `@frigear-nu/authorization` guards the area and no custom permission is configured.
export const adminAccess = defineAccess('admin', {
  permissions: {
    access: {
      label: 'Access the admin area',
      description: 'Open the pages under the admin area. The data behind them checks its own permissions.',
      grantTo: ['admin'],
    },
  },
})

// The Settings page "Search" (`<base>/search`) and its `POST /api/admin/search/reindex`, which runs module-kit's
// `search:reindex` task on demand (after a deploy that changed how a search column is computed). Registered in
// `module.ts` only when a module registered a search index (`registerSearchIndex`), like the route, page and menu
// entry: an app without one has no `search:reindex`. Session only: it rewrites every row of the indexed tables.
export const searchAccess = defineAccess('search', {
  i18n: 'admin',
  permissions: {
    reindex: {
      label: 'Rebuild search',
      description: 'Recompute the search columns of every table that has them.',
      grantTo: ['admin'],
      sessionOnly: true,
    },
  },
})
