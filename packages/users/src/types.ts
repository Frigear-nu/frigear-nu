export type AuthMethod = (string | 'passkeys' | 'emailPassword')
export type AuthMethodObject = { label: string, value: AuthMethod, icon?: string }
export type AuthManifest = {
  methods: AuthMethodObject[]
  pages: {
    login?: string
    register?: string
  }
}
