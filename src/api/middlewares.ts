import { defineMiddlewares } from '@medusajs/framework/http'

export default defineMiddlewares({
  routes: [
    {
      // The webhook signature is computed over the exact bytes useSend sent.
      matcher: '/hooks/usesend',
      method: ['POST'],
      bodyParser: { preserveRawBody: true },
    },
  ],
})
