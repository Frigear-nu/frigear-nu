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
    seo?: {
      /** Emit hreflang alternates and `og:locale:alternate` on multi-locale sites (default `true`). */
      localeAlternates?: boolean
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
    seo?: {
      /** Emit hreflang alternates and `og:locale:alternate` on multi-locale sites (default `true`). */
      localeAlternates?: boolean
    }
    socials?: Record<string, string>
    github?: {
      url?: string
    }
  }
}
