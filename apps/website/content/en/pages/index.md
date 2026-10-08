---
title: Frigear
links: []
seo:
  title: Home
  description: Frigear is a nonprofit organization, solely run by volunteers.
---

::u-page-hero
---
orientation: horizontal
---

::hero-image-carousel
---
class: md:justify-self-center-safe
sizes: "90vw md:460px"
autoplayDelay: 3000
showArrows: true
showDots: false
overlay: true
overlayClass: "bg-gradient-to-t from-black/18 via-transparent to-primary/8"
maxWidthClass: "max-w-115"
frameClass: "hero-carousel-frame-fancy"
surfaceClass: "hero-carousel-surface"
images:
  - src: /images/carousels/home/arena-toilet.png
    alt: Concert at the Arena seen from the Frigear backstage area
  - src: /images/carousels/home/tower-build-1.JPG
    alt: Frigear volunteers building the Frigear lookout tower
  - src: /images/carousels/home/container-lift-office-1.png
    alt: Frigear's backline container being set up
  - src: /images/carousels/home/baggear-drill.png
    alt: Frigear back area — holes being drilled
  - src: /images/carousels/home/container-lift-office-2.png
    alt: Frigear container and office area
  - src: /images/carousels/home/fgr-frontgear-2025-3.png
    alt: Frigear event vibes 2025
  - src: /images/carousels/home/baggear-unicorn-chill.png
    alt: Frigear event vibes 2025
  - src: /images/carousels/home/fgr-frontgear-2025-2.png
    alt: Frigear event vibes 2025
  - src: /images/carousels/home/mud-concert-arena.png
    alt: Frigear event vibes at the Arena 2025
  - src: /images/carousels/home/fgr-frontgear-2025-5.png
    alt: Frigear volunteers in frontgear 2025
  - src: /images/carousels/home/roskilde-beer-armband-sun.png
    alt: Frigear vibes with wristbands and beers by the orange stage
  - src: /images/carousels/home/fgr-frontgear-2025-6.png
    alt: Frigear volunteers in frontgear 2025
  - src: /images/carousels/home/fgr-frontgear-spots-2025-1.png
    alt: Frigear spotlight above the bar in frontgear
  - src: /images/carousels/home/fgr-sunset-from-tower.jpg
    alt: View over Roskilde Festival, the Arena stage at sunset
  - src: /images/carousels/home/safety-first.png
    alt: Frigear workers in safety gear
  - src: /images/carousels/home/jeppek-frigear-grill.png
    alt: Frigear hang around the grill
---
::

#title
[{{ $doc.title }}]{.fancy-text.text-7xl.md:text-8xl} :br :br

  :::typewriter-effect{.mt-0 .block .leading-tight .min-h-[2.4em] .sm:min-h-[1.1em] .text-wrap .sm:text-nowrap}
  Nonprofit
  Volunteer run
  Project funding
  Volunteer organization
  Event production
  For the common good
  You wanna join?
  Become a volunteer!
  :::

#links
  :::u-button
  ---
  color: primary
  icon: i-carbon-email
  size: lg
  to: /en/#contact
  variant: subtle
  label: Get in touch
  ---
  :::

  :::u-button
  ---
  color: primary
  size: lg
  to: /en/membership
  trailing-icon: i-lucide-arrow-right
  label: Membership
  ---
  :::
::

::u-container{#contact .mb-6 .sm:mb-4 .flex .flex-col .lg:flex-row .md:justify-between .gap-2 .sm:gap-4 .px-1 .sm:px-3 .md:px-4 .lg:px-6}
  :::u-page-feature
  #title
  Contact us

  #description
  Send us a message if you have any questions, a Frigear volunteer will get back to you ASAP 💜 :br
  Check our social media while you are waiting 🐼

  :u-separator

  :social-links{.my-4}
  :::

  :::u-card{.w-full .lg:w-lg}
  ---
  variant: subtle
  ui:
    body: p-2 sm:p-4
  ---
  
  :site-contact-form
  :::
::
