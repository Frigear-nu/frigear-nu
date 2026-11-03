export default defineAppConfig({
  navigation: {
    // One header tab per top-level content folder (Get Started, Guide, Modules, Examples, Contribute), like nuxt.com.
    sub: "header",
  },
  ui: {
    contentNavigation: {
      slots: {
        // Docus hides the trailing chevron; show it, since sidebar groups fold (see components/docs/DocsAsideLeftBody.vue).
        linkTrailing: "inline-flex",
      },
    },
  },
});
