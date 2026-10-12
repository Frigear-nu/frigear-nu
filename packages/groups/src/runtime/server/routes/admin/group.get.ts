export default defineEventHandler(async (event) => {
  await requireGroupsManager(event)
  const row = await findGroupById(getRouterParam(event, 'id')!)
  return toGroupDto(row, await countMembers(row.id))
})
