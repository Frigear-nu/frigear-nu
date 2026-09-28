declare module 'nuxt/schema' {
  interface AppConfigInput {
    header?: {
      icon?: {
        desktop?: boolean
        mobile?: boolean
      }
    }
    socials?: Record<string, string>
    github?: {
      url?: string
    }
  }
}
