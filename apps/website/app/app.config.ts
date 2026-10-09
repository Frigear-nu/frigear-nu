export default defineAppConfig({
  site: {
    name: 'Frigear.nu',
  },
  socials: {
    instagram: 'https://instagram.com/frigear.nu',
    facebook: 'https://facebook.com/frigear.nu',
    linkedin: 'https://www.linkedin.com/company/frigear',
    youtube: 'https://www.youtube.com/@frigear',
    tiktok: 'https://www.tiktok.com/@frigear.nu',
  },
  github: {
    url: 'https://github.com/Frigear-nu/nuxt-frigear-nu/',
  },
  ui: {
    section: {
      container: 'w-full max-w-(--ui-container) mx-auto px-0 sm:px-3 lg:px-6 flex flex-col lg:grid py-8 sm:py-16 lg:py-24 gap-6 sm:gap-12',
    },
    pageHero: {
      slots: {
        title: 'text-4xl sm:text-7xl text-pretty tracking-tight font-bold text-highlighted',
        container: 'w-full max-w-(--ui-container) mx-auto px-2 sm:px-4 lg:px-6 flex flex-col lg:grid py-12 sm:py-16 lg:py-24 gap-12 sm:gap-y-10',
      },
    },
    colors: {
      primary: 'violet',
      secondary: 'indigo',
      tertiary: 'amber',
      info: 'teal',
      neutral: 'slate',
      success: 'green',
      warning: 'amber',
      error: 'red',
    },
    collapsible: {
      slots: {
        root: '',
        content: 'data-[state=open]:animate-[collapsible-down_300ms_ease-in-out] data-[state=closed]:animate-[collapsible-up_400ms_ease-in-out] overflow-hidden',
      },
    },
  },
})
