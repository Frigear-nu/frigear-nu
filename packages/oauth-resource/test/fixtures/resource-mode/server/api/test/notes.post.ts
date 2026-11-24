// `notes:write`: granted by this app's `member` role.
export default defineEventHandler(event => testCaller(event, 'notes:write'))
