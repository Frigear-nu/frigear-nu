---
title: Sikkerhed
description: Hvordan Frigear beskytter data om medlemmer, frivillige og samarbejdspartnere.
---

::u-page-header
---
class: mt-4 mb-6
---
#headline
DATABESKYTTELSE & IT-SIKKERHED

#title
Sikkerhedsstandarder

#description
Vores grundlæggende sikkerhedsstandarder og de kontroller vi bruger til at beskytte data om medlemmer, frivillige og samarbejdspartnere.
::

::div{.flex.flex-col.gap-4.mt-4}
  :::u-page-card
  ---
  icon: i-lucide-shield
  ---
  #title
  Sikkerhedspolitik (overblik)

  #description
  Frigear beskytter person- og organisationsdata med et risikobaseret sikkerhedsprogram, der følger principperne i **ISO/IEC 27001** (fortrolighed, integritet, tilgængelighed) og er i overensstemmelse med EU’s krav til databeskyttelse.

  Denne side beskriver vores **grundlæggende kontroller**. Nogle projekter og samarbejder kan anvende strengere krav afhængigt af risiko og juridiske forpligtelser.
  :::

  :::u-page-card
  ---
  icon: i-lucide-users
  ---
  #title
  1\. Hvem er ansvarlig?

  #description
  Den almennyttige forening Frigear, CVR-nr. 44353261, er ansvarlig for at sikre passende tekniske og organisatoriske sikkerhedsforanstaltninger.

  Adgang til systemer og data gives kun til frivillige/admins, regnskab og juridiske repræsentanter, som har behov for det for at udføre deres rolle, og adgangen gennemgås løbende.
  :::

  :::u-page-card
  ---
  icon: i-lucide-key-round
  ---
  #title
  2\. Adgangskontrol & godkendelse

  #description
  Vi reducerer risikoen for uautoriseret adgang ved at bruge:

  - Rollebaseret adgang (mindst mulige rettigheder)
  - Unikke brugerkonti (ingen delte logins til følsomme systemer)
  - Multi-faktor godkendelse (MFA) hvor det er muligt
  - Stærke adgangskodekrav og sikker opbevaring af adgangskoder
  - Løbende gennemgang af adgang og afmelding ved rolle- eller ansvarsændringer
  :::

  :::u-page-card
  ---
  icon: i-lucide-lock
  ---
  #title
  3\. Kryptering & sikker kommunikation

  #description
  Vi beskytter data under overførsel og – hvor det understøttes – i hvile:

  - HTTPS/TLS til webtrafik og API’er
  - Krypterede forbindelser mellem tjenester (hvor det understøttes)
  - Sikker håndtering af hemmeligheder (API-nøgler, tokens) og miljøvariabler
  - Princip: send aldrig følsomme data i klartekst i usikre kanaler
  :::

  :::u-page-card
  ---
  icon: i-lucide-database
  ---
  #title
  4\. Dataminimering & opbevaring

  #description
  Sikkerhed starter med at indsamle mindre:

  - Vi indsamler kun data, der er nødvendige for medlemsadministration, frivilligarbejde, arrangementer og aftalte samarbejder
  - Vi begrænser adgang til følsomme data (fx betalingsrelaterede oplysninger) og adskiller dem hvor det er muligt
  - Vi sletter eller anonymiserer data, når de ikke længere er nødvendige, i tråd med vores privatlivspolitik og juridiske forpligtelser
  :::

  :::u-page-card
  ---
  icon: i-lucide-server
  ---
  #title
  5\. Hosting, leverandører & samarbejder

  #description
  Vi bruger anerkendte leverandører og baserer os på deres uafhængigt reviderede sikkerheds- og complianceprogrammer, proportionalt med risiko.

  **Kerneleverandører**
  - **Cloudflare** (sikkerhed/performance edge-tjenester): offentliggør compliance-ressourcer, der dækker **SOC 2 Type II** samt deres tilgang til **ISO 27001 / ISO 27701** og **PCI DSS**:
    - [ISO 27001 Cloudflare Trust Hub](https://www.cloudflare.com/trust-hub/){rel="noopener noreferrer"}
    - [ISO 27001 Cloudflare Trust Hub Compliance](https://www.cloudflare.com/trust-hub/compliance-resources/){rel="noopener noreferrer"}

  - **Google** (Google Workspace): angiver uafhængige certificeringer som **ISO/IEC 27001** og privatlivsrelaterede cloud-standarder som **ISO/IEC 27018 / ISO/IEC 27701** (tilgængelighed varierer efter produkt og omfang):
    - [ISO 27701 Google - Lær om sikkerhed](https://workspace.google.com/learn-more/security/security-whitepaper/page-5/){rel="noopener noreferrer"}
    - [ISO 27701 Google Virksomhedssikkerhed](https://business.safety.google/compliance/){rel="noopener noreferrer"}

  - **Microsoft** (Microsoft 365): offentliggør compliance-tilbud og revisionsrapporter (herunder **ISO 27001** og relaterede rammeværk) via Microsofts compliance-dokumentation og Service Trust Portal:
    - [Lær om Microsoft](https://learn.microsoft.com/en-us/compliance/regulatory/offering-home){rel="noopener noreferrer"}
    - [Microsoft Services](https://servicetrust.microsoft.com/){rel="noopener noreferrer"}

  **Betalinger (vi opbevarer ikke kortnumre)**
  - **Stripe**: angiver **SOC 1** og **SOC 2 Type II** audits samt **PCI Service Provider Level 1**:
    - [Stripe sikkerhed](https://docs.stripe.com/security){rel="noopener noreferrer"}
    - [Stripe PCI Compliance](https://stripe.com/guides/pci-compliance){rel="noopener noreferrer"}

  - **MobilePay** (Vipps MobilePay): angiver **PCI DSS**-kompatible betalingstjenester og at de håndterer **PSD2/SCA**-krav:
    - [Vipps Pay checkout](https://developer.vippsmobilepay.com/docs/plugins-ext/checkout-magento/){rel="noopener noreferrer"}
    - [MobilePay forhandler info](https://developer.vippsmobilepay.com/docs/knowledge-base/merchant-info/){rel="noopener noreferrer"}
  :::

  :::u-page-card
  ---
  icon: i-lucide-activity
  ---
  #title
  6\. Overvågning, logging & hændelseshåndtering

  #description
  Vi arbejder for at opdage problemer tidligt og reagere hurtigt:

  - Audit-logs hvor det er tilgængeligt (admin-handlinger, adgangshændelser)
  - Alarmer ved mistænkelig aktivitet (hvor det understøttes)
  - Proces for sikkerhedshændelser: afgræns → vurder påvirkning → udbedr → dokumentér → forbedr kontroller
  - Vi underretter relevante parter, når det kræves af lovgivning eller kontraktlige forpligtelser
  :::

  :::u-page-card
  ---
  icon: i-lucide-refresh-cw
  ---
  #title
  7\. Backups & gendannelse

  #description
  Tilgængelighed er også vigtigt:

  - Backups af kritiske data hvor platformen understøtter det
  - Gendannelsesprocedurer testes når det er muligt
  - Vi designer systemer til at reducere single points of failure, proportionalt med projektets størrelse og risiko
  :::

  :::u-page-card
  ---
  icon: i-lucide-bug
  ---
  #title
  8\. Indrapportering af sårbarheder (ansvarlig offentliggørelse)

  #description
  Hvis du mener, du har fundet en sikkerhedsfejl, så rapportér den venligst privat. Offentliggør den ikke offentligt, før vi har haft mulighed for at undersøge den.

  ::::contact-form-modal
  ---
  label: Rapportér en sikkerhedsfejl
  initial:
    subject: other
    subjectOther: Sikkerhedsfejl / ansvarlig offentliggørelse
  ---
  ::::
  :::

  :::u-page-card
  ---
  icon: i-lucide-award
  ---
  #title
  9\. Standarder vi refererer til

  #description
  Sikkerhedsstandarder/attestationer vedrørende håndtering af persondata og betalinger:

  - **GDPR — Forordning (EU) 2016/679** (databeskyttelse):
    [GDPR Forordning](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng){rel="noopener noreferrer"}

  - **ISO/IEC 27001** (baseline for informationssikkerhedsledelse):
    [ISO 27001 Baseline](https://www.iso.org/standard/27001){rel="noopener noreferrer"}

  - **SOC 2** (uafhængig assurance-rapport for serviceorganisationer, Trust Services Criteria):
    [SOC2 Uafhængig assurance](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2){rel="noopener noreferrer"}

  - **PCI DSS** (sikkerhedsstandard for betalingskortdata):
    [PCI DSS standarder](https://www.pcisecuritystandards.org/standards/pci-dss/){rel="noopener noreferrer"}

  - **PSD2 — Direktiv (EU) 2015/2366** (betalingstjenester, herunder SCA):
    [PSD2 Direktiv](https://eur-lex.europa.eu/eli/dir/2015/2366/oj/eng){rel="noopener noreferrer"}
  :::

::div{.grid.grid-cols-1.sm:grid-cols-2.md:grid-cols-3.lg:grid-cols-4.xl:grid-cols-5.gap-4.mt-6.center.justify-center}

:::u-page-card
---
icon: i-lucide-badge-check
class: text-center
---
#title
SOC 2 (AICPA)

#description
:::div{.h-full.w-full.bg-neutral-100.dark:bg-neutral-800.rounded-full.items-center.justify-center.mt-4.mb-4.p-2.flex}
  ::::img{src="/images/compliance/badges/aicpa-soc.svg" alt="SOC 2 (AICPA)" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2.text-sm}
  Uafhængig assurance-rapport (leverandørattestationer).  
  [Officiel SOC 2-oversigt](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2){target="_blank" rel="noopener noreferrer"}
:::
:::

:::u-page-card
---
icon: i-lucide-shield-check
class: text-center
---
#title
GDPR (EU 2016/679)

#description
:::div{.h-full.w-full.bg-neutral-100.dark:bg-neutral-800.rounded-full.items-center.justify-center.mt-4.mb-4.p-2.flex}
  ::::img{src="/images/compliance/badges/gdpr.svg" alt="GDPR (EU 2016/679)" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2.text-sm}
  EU’s databeskyttelsesforordning.  
  [Officiel lovtekst](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng){target="_blank" rel="noopener noreferrer"}
:::
:::

:::u-page-card
---
icon: i-lucide-lock
class: text-center
---
#title
ISO/IEC 27001

#description
:::div{.h-full.w-full.bg-neutral-100.dark:bg-neutral-800.rounded-full.items-center.justify-center.mt-4.mb-4.p-2.flex}
  ::::img{src="/images/compliance/badges/iso-27001.svg" alt="ISO/IEC 27001" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2.text-sm}
  Baseline ISMS-reference anvendt på tværs af mange leverandører.  
  [Officiel ISO-side](https://www.iso.org/standard/27001){target="_blank" rel="noopener noreferrer"}
:::
:::

:::u-page-card
---
icon: i-lucide-credit-card
class: text-center
---
#title
PCI DSS (betalinger)

#description
:::div{.h-full.w-full.bg-neutral-100.dark:bg-neutral-800.rounded-full.items-center.justify-center.mt-4.mb-4.p-2.flex}
  ::::img{src="/images/compliance/badges/pci-dss.svg" alt="PCI DSS" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2.text-sm}
  Sikkerhedsstandard for betalingskort (håndteres af vores betalingsudbydere).  
  [Officiel PCI DSS-side](https://www.pcisecuritystandards.org/standards/pci-dss/){target="_blank" rel="noopener noreferrer"}
:::
:::

:::u-page-card
---
icon: i-lucide-landmark
class: text-center
---
#title
PSD2 (EU-betalinger)

#description
:::div{.h-full.w-full.bg-neutral-100.dark:bg-neutral-800.rounded-full.items-center.justify-center.mt-4.mb-4.p-2.flex}
  ::::img{src="/images/compliance/badges/psd2.svg" alt="PSD2" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2.text-sm}
  EU-regler for betalingstjenester (inkl. stærk kundeautentifikation).  
  [Officiel lovtekst](https://eur-lex.europa.eu/eli/dir/2015/2366/oj/eng){target="_blank" rel="noopener noreferrer"}
:::
:::

::

  :::u-page-card
  ---
  icon: i-lucide-send
  ---
  #title
  Kontakt os

  #description
  Spørgsmål om sikkerhedskontroller, datahåndtering i samarbejder eller risikovurderinger:

  ::::contact-form-modal
  ---
  label: Kontakt os om sikkerhed
  initial:
    subject: other
    subjectOther: Sikkerhedsspørgsmål
  ---
  ::::
  :::

  :::u-page-card
  ---
  icon: i-lucide-calendar-sync
  ---
  #title
  Sidst opdateret

  #description
  Februar 2026
  :::
::
