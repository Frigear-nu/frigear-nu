export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate',
    },
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
