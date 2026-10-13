// Staff scopes are only offered to users the host's `forms:authorize` policy lets in.
export default defineStaffScopes(['forms:manage', 'forms:pii'], (event, userId) => canManageForms(event, { user: { id: userId } }))
