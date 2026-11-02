import { getRequestURL } from 'h3'

export default defineEventHandler(event => ({
  issuer: getRequestURL(event).origin,
  token_endpoint: `${getRequestURL(event).origin}/api/test/idp/token`,
}))
