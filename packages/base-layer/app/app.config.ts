export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate',
    },
  },
  seo: {
    // Emits hreflang and og:locale:alternate tags on multi-locale sites. Turn off when the app writes its own.
    localeAlternates: true,
  },
  header: {
    // Shows the colour-mode toggle in the header. Apps whose account menu offers Appearance can turn it off.
    colorMode: true,
    icon: {
      desktop: false,
      mobile: true,
    },
  },
})
