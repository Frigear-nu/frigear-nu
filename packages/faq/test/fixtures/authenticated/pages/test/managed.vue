<template>
  <div>
    <section data-test="faq-single">
      <Faq group="page-managed" />
    </section>
    <section data-test="faq-grid">
      <FaqGrid groups="page-managed,page-second" />
    </section>
    <section data-test="faq-list">
      <FaqSectionList :groups="['page-second']" />
    </section>
  </div>
</template>
