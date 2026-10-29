// Staff scopes are only offered to users the host's `payments:authorize` policy lets in.
export default defineStaffScopes(['payments:manage'], (event, userId) => paymentsStaff.can(event, userId))
