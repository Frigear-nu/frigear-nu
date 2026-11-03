// What credentials a request arrived with, for the server-mode `$api` test.
export default defineEventHandler(event => ({
  cookie: getHeader(event, 'cookie') ?? null,
  authorization: getHeader(event, 'authorization') ?? null,
}))
