---
title: Frigear
links: []
seo:
  title: Hjem
  description: Frigear er en non-profit organisation, udelukkende drevet af frivillige.
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
    alt: Koncert på Arena set fra Frigear backstage område
  - src: /images/carousels/home/tower-build-1.JPG
    alt: Frigear frivillige bygger Frigear lystårnet
  - src: /images/carousels/home/container-lift-office-1.png
    alt: Frigear's bagråde container bli'r sat op
  - src: /images/carousels/home/baggear-drill.png
    alt: Frigear bagområde - der bli'r gravet huller
  - src: /images/carousels/home/container-lift-office-2.png
    alt: Frigear container og kontorområde
  - src: /images/carousels/home/fgr-frontgear-2025-3.png
    alt: Frigear eventstemning 2025
  - src: /images/carousels/home/baggear-unicorn-chill.png
    alt: Frigear eventstemning 2025
  - src: /images/carousels/home/fgr-frontgear-2025-2.png
    alt: Frigear eventstemning 2025
  - src: /images/carousels/home/mud-concert-arena.png
    alt: Frigear eventstemning ved Arena 2025
  - src: /images/carousels/home/fgr-frontgear-2025-5.png
    alt: Frigear frivillige i frontgear 2025
  - src: /images/carousels/home/roskilde-beer-armband-sun.png
    alt: Frigear stemning med armbånd og øl ved orange scene
  - src: /images/carousels/home/fgr-frontgear-2025-6.png
    alt: Frigear frivillige i frontgear 2025
  - src: /images/carousels/home/fgr-frontgear-spots-2025-1.png
    alt: Frigear spot over baren i frontgear
  - src: /images/carousels/home/fgr-sunset-from-tower.jpg
    alt: Udsigt over Roskilde festivalen, Arena scenen ved solnedgang
  - src: /images/carousels/home/safety-first.png
    alt: Frigear arbejdere i sikkerhedsudstyr
  - src: /images/carousels/home/jeppek-frigear-grill.png
    alt: Frigear hygge ved grillen
---
::

#title
[{{ $doc.title }}]{.fancy-text.text-7xl.md:text-8xl} :br :br

  :::typewriter-effect{.mt-0 .block .leading-tight .min-h-[2.4em] .sm:min-h-[1.1em] .text-wrap .sm:text-nowrap}
  Nonprofit
  Frivilligdrevet
  Projekstøtte
  Frivilligforening
  Event produktion
  Almennyttigt
  Skal du med?
  Bliv frivillig!
  :::

#links
  :::u-button
  ---
  color: primary
  icon: i-carbon-email
  size: lg
  to: /#contact
  variant: subtle
  label: Kontakt os
  ---
  :::

  :::u-button
  ---
  color: primary
  size: lg
  to: /membership
  trailing-icon: i-lucide-arrow-right
  label: Bliv medlem
  ---
  :::
::

::u-container{#contact .mb-6 .sm:mb-4 .flex .flex-col .lg:flex-row .md:justify-between .gap-2 .sm:gap-4 .px-1 .sm:px-3 .md:px-4 .lg:px-6}
  :::u-page-feature
  #title
  Kontakt os

  #description
  Smid os en besked hvis du har nogen spørgsmål, så vender en Frigear frivillig tilbage ASAP 💜 :br
  Tjek vores SoMe mens du venter 🐼

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
