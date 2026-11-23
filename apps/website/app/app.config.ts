export default defineAppConfig({
  users: {
    authLogo: {
      light: '/images/branding/logos/full/frigear-logo-purple-512-275.png',
      dark: '/images/branding/logos/full/frigear-logo-white-2834-1479.png',
    },
  },
  header: {
    // Appearance lives in the account menu; signed-out visitors still have the toggle in the footer.
    colorMode: false,
  },
  frigearUi: {
    // The app's one time zone: `useFormat()` renders dates in it on the server and the client alike, so hydration
    // never disagrees, and shift times are entered, shown and emailed in it.
    timeZone: 'Europe/Copenhagen',
  },
  // The help-center categories (slugs) whose FAQ cards a page shows (`::page-faq-section{page="board"}`). Staff write
  // them at /admin/help-center/faq as public categories shown as question cards (`cards`: a card per question, with
  // `::faq-details` and `::faq-link` blocks in the text); until one exists, the page leaves its FAQ section out. The
  // contact cards under the /funding application section are the `funding-contact` category (`::faq-grid` in
  // content/*/pages/funding.md).
  pageFaqs: {
    board: ['board'],
    funding: ['funding'],
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
