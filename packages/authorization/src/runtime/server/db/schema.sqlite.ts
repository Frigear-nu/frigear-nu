import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'

// There is deliberately no foreign key to `users` (another module's table, generated into another file): whoever
// removes or re-keys a user calls `deleteAuthorizationUserRoles` / `rekeyAuthorizationUserRoles`. User ids are never
// reused, so a leftover row can never give a role to someone else.

/** The roles assigned to a user. Default and `auto` roles are never stored: every user meeting them holds them. */
export const authorizationUserRoles = sqliteTable('authorization_user_roles', {
  userId: integer('user_id').notNull(),
  /** A role name from `authorization.roles`. Unknown names are kept and ignored at runtime. */
  role: text('role').notNull(),
  /** `manual` (an admin), `sso` (single sign-on, replaced on every sign-in) or `migrated` (copied from `users.role`). */
  source: text('source').$type<'manual' | 'sso' | 'migrated'>().notNull(),
  grantedBy: integer('granted_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  primaryKey({ columns: [t.userId, t.role] }),
  index('authorization_user_roles_role_idx').on(t.role),
])

/** Key-value markers of one-off tasks, such as the `users.role` migration. */
export const authorizationMeta = sqliteTable('authorization_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
