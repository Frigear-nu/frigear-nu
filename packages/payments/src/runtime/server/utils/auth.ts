/**
 * The staff gate of `/api/admin/payments`. The host decides who is staff through the `payments:authorize` Nitro hook;
 * denied by default. Bearer tokens need the `payments:manage` scope.
 */
export const paymentsStaff = defineStaffGuard({
  hook: 'payments:authorize',
  scope: 'payments:manage',
  message: 'You are not allowed to see payments.',
})
