// Staff scopes are only offered to users the host's `events:authorize` policy lets in.
export default defineStaffScopes(['events:manage', 'events:pii'], (event, userId) => canManageEvents(event, { user: { id: userId } }))
