import { defineAccess } from '@frigear-nu/auth/access'

// What the maps module adds to access control, registered in `module.ts` (`registerAccess`). Routes and tests name the
// permissions through it (`mapsAccess.permissions.manage` is `'maps:manage'`). The policies (`server/policies.ts`)
// receive the MAP row.
export const mapsAccess = defineAccess('maps', {
  permissions: {
    // Self-service: every signed-in user holds it. Which maps it covers is the policy's business: the map's
    // `visibility` (through `@frigear-nu/audience`), and every map for `maps:manage`.
    read: {
      label: 'Read maps',
      description: 'See the maps (and their layers) that are visible to you.',
      implicit: true,
    },
    // Every signed-in user holds it, and the policy narrows it to nothing unless the caller holds `maps:manage`, the
    // map kind's `editPermission`, or an owner module answers `maps:edit:resolve` with `allowed = true`.
    edit: {
      label: 'Edit maps',
      description: 'Draw and change features on the maps you are allowed to edit.',
      implicit: true,
    },
    manage: {
      label: 'Manage maps',
      description: 'Create, edit and delete every map, its layers and its floor plan.',
      grantTo: ['admin', 'coordinator'],
    },
  },
  scopes: {
    maps: {
      label: 'Maps',
      description: 'See the maps that are visible to you.',
      icon: 'i-lucide-map',
      permissions: ['maps:read'],
    },
  },
})
