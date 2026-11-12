// A host mapper that rewrites `role` for display: the session user of an editor says "Editor", a role that does not
// exist. Permissions must still follow the stored role, for sessions and bearer tokens alike.
export default (user: Record<string, unknown>) => (user.role === 'editor' ? { ...user, role: 'Editor' } : user)
