// A staff route with no host policy listener: the role decides (`reports:write`, granted to editors).
const reportsStaff = defineStaffGuard({ hook: 'reports:authorize', scope: 'reports:write', message: 'Not staff.' })

export default defineEventHandler(async (event) => {
  await reportsStaff.require(event)
  return { staff: true }
})
