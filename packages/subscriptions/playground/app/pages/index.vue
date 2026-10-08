<template>
  <div>
    <h1>@frigear-nu/subscriptions</h1>
    <p>
      Forward Stripe events with
      <code>stripe listen --forward-to localhost:3000/api/stripe/webhook</code>, then visit
      <NuxtLink to="/account/membership">
        /account/membership
      </NuxtLink>.
    </p>
  </div>
</template>
