export const useAuthManifest = () => {
  return {
    name: 'users',
    version: '1.0.0',
    description: 'User management module for authentication and authorization.',
  } as const
}
