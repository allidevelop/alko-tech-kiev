import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const authProviders: any[] = [
  {
    resolve: "@medusajs/medusa/auth-emailpass",
    id: "emailpass",
  },
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  authProviders.push({
    resolve: "@medusajs/medusa/auth-google",
    id: "google",
    options: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
  })
}

module.exports = defineConfig({
  featureFlags: {
    caching: true,
    translation: true,
  },
  admin: {
    vite: () => ({
      server: {
        allowedHosts: ["alko-technics.kiev.ua", "localhost"],
      },
    }),
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  plugins: [
    {
      resolve: "@variablevic/google-analytics-medusa",
      options: {
        measurementId: process.env.GA_MEASUREMENT_ID,
        apiSecret: process.env.GA_API_SECRET,
        debug: process.env.NODE_ENV !== "production",
      },
    },
  ],
  modules: [
    {
      resolve: "./src/modules/checkbox",
    },
    {
      resolve: "./src/modules/product-specs",
    },
    {
      resolve: "./src/modules/resend-notification",
    },
    {
      resolve: "@medusajs/medusa/translation",
    },
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            resolve: "@medusajs/caching-redis",
            id: "caching-redis",
            is_default: true,
            options: {
              redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: authProviders,
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
          {
            resolve: "./src/modules/nova-poshta-fulfillment",
            id: "nova-poshta",
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/monobank-payment",
            id: "monobank",
          },
          {
            resolve: "./src/modules/liqpay-payment",
            id: "liqpay-payment",
            options: {
              publicKey: process.env.LIQPAY_PUBLIC_KEY,
              privateKey: process.env.LIQPAY_PRIVATE_KEY,
            },
          },
          {
            resolve: "./src/modules/monobank-installments",
            id: "monobank-installments",
          },
          {
            resolve: "./src/modules/cod-payment",
            id: "cod",
          },
        ],
      },
    },
  ],
})
