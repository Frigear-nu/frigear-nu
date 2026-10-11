export class AuthorizationError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'AuthorizationError'
    this.statusCode = statusCode
  }
}

export function createAuthorizationError(message = 'Unauthorized', statusCode = 403) {
  return new AuthorizationError(message, statusCode)
}
