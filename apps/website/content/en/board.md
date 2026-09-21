---
title: Board

cards:
  - title: Who is on the board?
    icon: i-lucide-info
    description: 100% volunteer board.
  - title: How can I contribute?
    icon: i-lucide-info
    description: Everyone is welcome to contribute.
  - title: How can I join?
    icon: i-lucide-info
    description: Everyone is welcome to join.
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
A few things, -before you apply . . .

#description

Anyone can apply to join the board.

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
Are you ready to apply?

#links
::::u-button
---
color: primary
size: xl
to: /en/forms/board-member-application
trailingIcon: i-lucide-arrow-right
variant: subtle
class: mt-12
---
Jump to the board application form
::::
:::
::