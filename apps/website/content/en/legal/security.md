---
title: Security
description: How Frigear protects member, volunteer and partner data.
---

::u-page-header
---
class: mt-4 mb-6
---
#headline
DATA PROTECTION & SECURITY

#title
Security standards

#description
Our baseline security standards and the controls we use to keep member, -volunteer, and -partner data safe.
::

::div{.flex .flex-col .gap-4 .mt-4}
  :::u-page-card
  ---
  icon: i-lucide-shield
  ---
  #title
  Security policy (overview)

  #description
  Frigear protects personal and organisational data using a risk-based security program following **ISO/IEC 27001** principles (confidentiality, integrity, availability) and is aligned with EU data protection requirements.

  This page describes our **baseline controls**. Some projects and partnerships may apply stricter requirements depending on risk and legal obligations.
  :::

  :::u-page-card
  ---
  icon: i-lucide-users
  ---
  #title
  1\. Who is responsible?

  #description
  The nonprofit organisation Frigear, CVR-nr. 44353261, is responsible for ensuring appropriate technical and organisational security measures.

  Access to systems and data is granted only to volunteers/admins, accounting and legal representatives who need it to perform their role, and is reviewed regularly.
  :::

  :::u-page-card
  ---
  icon: i-lucide-key-round
  ---
  #title
  2\. Access control & authentication

  #description
  We reduce the risk of unauthorised access by using:

  - Role-based access (least privilege)
  - Unique user accounts (no shared logins for sensitive systems)
  - Multi-factor authentication (MFA) where available
  - Strong password policies and secure password storage
  - Regular access reviews and offboarding when roles change
  :::

  :::u-page-card
  ---
  icon: i-lucide-lock
  ---
  #title
  3\. Encryption & secure communication

  #description
  We protect data in transit and, where supported, at rest:

  - HTTPS/TLS for web traffic and APIs
  - Encrypted connections between services (where supported)
  - Secure handling of secrets (API keys, tokens) and environment variables
  - Principle: never send sensitive data in plaintext channels
  :::

  :::u-page-card
  ---
  icon: i-lucide-database
  ---
  #title
  4\. Data minimisation & retention

  #description
  Security starts by collecting less:

  - We only collect data needed for membership administration, volunteering, events, and agreed partnerships
  - We limit access to sensitive data (e.g. payment-related data) and keep it separate where possible
  - We delete or anonymise data when it is no longer needed, aligned with our privacy policy and legal obligations
  :::

  :::u-page-card
  ---
  icon: i-lucide-server
  ---
  #title
  5\. Hosting, suppliers & partnerships

  #description
  We use reputable providers and rely on their independently-audited security and compliance programs, proportionate to risk.

  **Core providers**
  - **Cloudflare** (security/performance edge services): publishes compliance resources covering **SOC 2 Type II** and their posture around **ISO 27001 / ISO 27701** and **PCI DSS**:
    - [ISO 27001 Cloudflare Trust Hub](https://www.cloudflare.com/trust-hub/){rel="noopener noreferrer"}
    - [ISO 27001 Cloudflare Trust Hub Compliance](https://www.cloudflare.com/trust-hub/compliance-resources/){rel="noopener noreferrer"}

  - **Google** (Google Workspace): lists independent certifications such as **ISO/IEC 27001** and privacy-related cloud standards like **ISO/IEC 27018 / ISO/IEC 27701** (availability varies by product and scope):
    - [Google security whitepaper (ISO 27701 context)](https://workspace.google.com/learn-more/security/security-whitepaper/page-5/){rel="noopener noreferrer"}
    - [Google business compliance resources](https://business.safety.google/compliance/){rel="noopener noreferrer"}

  - **Microsoft** (Microsoft 365): publishes compliance offerings and audit reports (including **ISO 27001** and related frameworks) via the Microsoft compliance documentation and the Service Trust Portal:
    - [Microsoft compliance offerings](https://learn.microsoft.com/en-us/compliance/regulatory/offering-home){rel="noopener noreferrer"}
    - [Microsoft Services](https://servicetrust.microsoft.com/){rel="noopener noreferrer"}

  **Payments (we do not store card numbers)**
  - **Stripe**: states **SOC 1** and **SOC 2 Type II** audits and **PCI Service Provider Level 1**:
    - [Stripe security](https://docs.stripe.com/security){rel="noopener noreferrer"}
    - [Stripe PCI Compliance](https://stripe.com/guides/pci-compliance){rel="noopener noreferrer"}

  - **MobilePay** (Vipps MobilePay): states **PCI DSS compliant payment services** and that they handle **PSD2/SCA** requirements:
    - [Vipps Pay checkout](https://developer.vippsmobilepay.com/docs/plugins-ext/checkout-magento/){rel="noopener noreferrer"}
    - [MobilePay merchant info](https://developer.vippsmobilepay.com/docs/knowledge-base/merchant-info/){rel="noopener noreferrer"}
  :::

  :::u-page-card
  ---
  icon: i-lucide-activity
  ---
  #title
  6\. Monitoring, logging & incident response

  #description
  We aim to detect issues early and respond quickly:

  - Audit logs where available (admin actions, access events)
  - Alerts for suspicious activity (where supported)
  - Incident handling process: contain → assess impact → remediate → document → improve controls
  - We notify relevant parties when required by law or contractual obligations
  :::

  :::u-page-card
  ---
  icon: i-lucide-refresh-cw
  ---
  #title
  7\. Backups & recovery

  #description
  Availability matters too:

  - Backups for critical data where the platform supports it
  - Recovery procedures tested when feasible
  - We design systems to reduce single points of failure, proportional to project size and risk
  :::

  :::u-page-card
  ---
  icon: i-lucide-bug
  ---
  #title
  8\. Vulnerability reporting (responsible disclosure)

  #description
  If you believe you’ve found a security issue, please report it privately. Do not disclose publicly before we’ve had a chance to investigate.

  ::::contact-form-modal
  ---
  label: Report a security issue
  initial:
    subject: other
    subjectOther: Security issue / vulnerability disclosure
  ---
  ::::
  :::

  :::u-page-card
  ---
  icon: i-lucide-award
  ---
  #title
  9\. Standards we reference

  #description
  Security standards/attestations regarding the handling of personal data and payments:

  - **GDPR — Regulation (EU) 2016/679** (data protection):
    [GDPR Standards](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng){rel="noopener noreferrer"}

  - **ISO/IEC 27001** (information security management system baseline):
    [ISO 27001 Baseline](https://www.iso.org/standard/27001){rel="noopener noreferrer"}

  - **SOC 2** (independent assurance report for service organisations, Trust Services Criteria):
    [SOC2 Independent assurance](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2){rel="noopener noreferrer"}

  - **PCI DSS** (payment card data security standard):
    [PCI DSS standards](https://www.pcisecuritystandards.org/standards/pci-dss/){rel="noopener noreferrer"}

  - **PSD2 — Directive (EU) 2015/2366** (payment services, including SCA requirements):
    [PSD2 Directive](https://eur-lex.europa.eu/eli/dir/2015/2366/oj/eng){rel="noopener noreferrer"}
  :::

::div{.grid .grid-cols-1 .sm:grid-cols-2 .md:grid-cols-3 .lg:grid-cols-4 .xl:grid-cols-5 .gap-4 .mt-6 .center .justify-center}

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
  Independent assurance report (vendor attestations).  
  [Official SOC 2 overview](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2){target="_blank" rel="noopener noreferrer"}
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
:::div{.h-full .w-full .bg-neutral-100 .dark:bg-neutral-800 .rounded-full.items-center .justify-center .mt-4 .mb-4 .p-2.flex}
  ::::img{src="/images/compliance/badges/gdpr.svg" alt="GDPR (EU 2016/679)" loading="lazy" class="h-full .w-full .object-contain"}
  ::::
:::

:::div{.mt-2 .text-sm}
  EU data protection regulation.  
  [Official legal text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng){target="_blank" rel="noopener noreferrer"}
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
:::div{.h-full .w-full .bg-neutral-100 .dark:bg-neutral-800 .rounded-full .items-center .justify-center .mt-4 .mb-4 .p-2 .flex}
  ::::img{src="/images/compliance/badges/iso-27001.svg" alt="ISO/IEC 27001" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2.text-sm}
  Baseline ISMS reference used across many vendors.  
  [Official ISO page](https://www.iso.org/standard/27001){target="_blank" rel="noopener noreferrer"}
:::
:::

:::u-page-card
---
icon: i-lucide-credit-card
class: text-center
---
#title
PCI DSS (payments)

#description
:::div{.h-full .w-full .bg-neutral-100 .dark:bg-neutral-800 .rounded-full .items-center .justify-center .mt-4 .mb-4 .p-2 .flex}
  ::::img{src="/images/compliance/badges/pci-dss.svg" alt="PCI DSS" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2 .text-sm}
  Payment card security standard (handled by our payment providers).  
  [Official PCI DSS page](https://www.pcisecuritystandards.org/standards/pci-dss/){target="_blank" rel="noopener noreferrer"}
:::
:::

:::u-page-card
---
icon: i-lucide-landmark
class: text-center
---
#title
PSD2 (EU payments)

#description
:::div{.h-full .w-full .bg-neutral-100 .dark:bg-neutral-800 .rounded-full .items-center .justify-center .mt-4 .mb-4 .p-2 .flex}
  ::::img{src="/images/compliance/badges/psd2.svg" alt="PSD2" loading="lazy" class="h-full.w-full.object-contain"}
  ::::
:::

:::div{.mt-2 .text-sm}
  EU payment services rules (incl. Strong Customer Authentication).  
  [Official legal text](https://eur-lex.europa.eu/eli/dir/2015/2366/oj/eng){target="_blank" rel="noopener noreferrer"}
:::
:::

::

  :::u-page-card
  ---
  icon: i-lucide-send
  ---
  #title
  Contact us

  #description
  For questions about security controls, data handling in partnerships, or risk assessments:

  ::::contact-form-modal
  ---
  label: Contact us about security
  initial:
    subject: other
    subjectOther: Security question
  ---
  ::::
  :::

  :::u-page-card
  ---
  icon: i-lucide-calendar-sync
  ---
  #title
  Last updated

  #description
  February 2026
  :::
::
