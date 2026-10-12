import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    MyModule,
  ],
  runtimeConfig: {
    session: {
      password: 'a-test-only-session-password-at-least-32-chars',
    },
    // Throwaway key generated for tests only.
    account: { idCode: { privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDZd8uuQqhyPS+i\nY3aJ0OeknTbh/NPzTeUch8RoRP5Ml0Tj0O52K5uMg+m788zttUuRNut5DzJHYYsf\nSWESGDh7xPXvaaUcMkME7XnQjIGoONE/ZO8xfseNYQoDaJ1E9Y40hm1CKOkEI6YH\nLVe0M+FYiXXREHNutPfgbC9eNv1wxsdQfr1g1k94eH0rWhlhgRApmd96ycUhyqHw\np1b8jVqGwP2zRGbiMNj1zLgAckq2uklQxA0VVfNYqwruHY/qAt0hIOLEbqSpSYDc\nyi/hZ1pMUktR/6T/oRKuZkAxppYqRqTY9yvgjRGngEeBzE72wOo1b5LXZ09plB5X\nGKHBHn3nAgMBAAECggEAbHT3iyBJfDgRwq5SVydt78ZMseZzGnv10QXRKaOHJFGp\nFOmFlD/pYuoDLy7HPKJXXsQCKi0vCTSXuvHQzMJxoSC4+z84Dlju3c1GHIGGxIwZ\np8FCHfA5u8Pyx4JsNRE2a/HDGeTnWZ4h1qCBhij9sTdVIABRYZw1p6Ks+RL50T0W\nPpoKn5fXK7BDHu9rLqvuw839j49bjAv9H8xK/n1jILwARxmQo5h896gfCYiD4tzL\nA4OHCuBIaMpLHpdwJW5YBqrEmcUJPa4crg2WKnuJUUPO3yYMl6u6NtruglrnryGf\nonWqSDD8FH5YMBWVCSSVCiXttgy9My/qFm9ZSddH+QKBgQD5p38ZPf3dOXw+uiF4\np9inuadSgFVl7qga/Ox93bCPhmc9ZCMfs0w5RGM1n1oVgmYsEzn2PSy73xa/VE9y\nWoz85jX+H3gHNGtj+Wk9yYEaH8xIgGZrLaeiHdT8NIFFHm/qvCNMkcPKzAb2JG2A\nlHBaUzNwmRCYidZj8PwNHyDkLQKBgQDe/ty/Dwir/V7UwErSSZ2Ggfi6QLYXmeYX\na9XlEwxendObTO4qkANYfPNQWVgTx+ZyYCFv3xUN1G3M0dNTdqzS8kg0nb6pJwTt\nVjbgYEXGhAiBKZx0bopSvhB5v254Z0lo8geFULf/G/5OPHvxCVWgzb7pU3mE8YMF\nyEtfhy0S4wKBgESr4RclaS4wANAUTN6udLb2J2NXL6ZhNlZuGfMpRsbD9qP5Znvy\nytW5zPxT/+iIvOgExd3IyARJgi1Q2KWg6MUr4dAsAc0hiySt11gKlHuGIaATyZhT\nr5e1Uv+oxaIolCpiY+dM9SlUY9nS/Vfv/NOrrSucvubmi1VkVUCavmZlAoGBANnn\nwHwuy7GNSKKrOTIeX4E19oDChW2wpKgUZxKPN5IptcLXPRB4Y9yPVRAaDjheKbFw\ngJwaKS+3eoggLdosaJtFyAsqbkpK58Sob714NhbTpJ/aspkP/7j1I5Jk3yVnANQ9\nVd4PT41JpIp9Djwue+9Dvh+ww1mGyxrWa9jwdbozAoGAF0V2p83DnPL9LRutU5ie\nVe500hlKiaTawnXiLvl3GasdN1m7Cf++HFaf9/nvqmkopt7nNvVLcSgRX/p1MtOB\n+CCTyt3XJUvt8vwNR8DgbsVrH9r4mfuZdF1KFypjBiCXDsI5OJeHaX47mBUfZfWG\n6a71K0SvupKWcJfgDwo76ig=\n-----END PRIVATE KEY-----' } },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  account: {
    settings: { mcp: true },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
