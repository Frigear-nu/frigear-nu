declare module 'nuxt/schema' {
  interface AppConfigInput {
    header?: {
      /** Show the colour-mode toggle in the header (default `true`). */
      colorMode?: boolean
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

  interface AppConfig {
    header?: {
      /** Show the colour-mode toggle in the header (default `true`). */
      colorMode?: boolean
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
