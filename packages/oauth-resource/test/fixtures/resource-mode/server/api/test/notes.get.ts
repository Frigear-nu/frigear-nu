// `notes:read`: implicit, every signed-in user holds it.
export default defineEventHandler(event => testCaller(event, 'notes:read'))
