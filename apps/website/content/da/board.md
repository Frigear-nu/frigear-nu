---
title: Bestyrelse

cards:
  - title: Hvem er i bestyrelsen?
    icon: i-lucide-info
    description: 100% frivillig bestyrelse.
  - title: Hvordan kan jeg bidrage?
    icon: i-lucide-info
    description: Alle er velkomne til at bidrage.
  - title: Hvordan kan jeg være med?
    icon: i-lucide-info
    description: Alle er velkomne til at blive med.
---

::u-page-hero
#title
{{$doc.title}}
::


::card{.shadow-2xl}
:::u-page-section
---
icon: i-lucide-message-circle-question-mark
id: good-to-know
---
#title
Lidt stuff, -inden du ansøger . . .

#description

Alle kan ansøge om at blive med i bestyrelsen.

#features
::::faq-section-list{:items='meta.cards'}
::::
:::
::


::card{.shadow-2xl}
:::u-page-section
---
icon: i-lucide-check-circle
id: project-application
---

#title
Er du klar til at ansøge?

#links
::::u-button
---
color: primary
size: xl
to: /forms/board-member-application
trailingIcon: i-lucide-arrow-right
variant: subtle
class: mt-12
---
Hop til ansøgningsformen
::::
:::
::