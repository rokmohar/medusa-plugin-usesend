# useSend plugin for Medusa

[![npm version](https://img.shields.io/npm/v/@rokmohar/medusa-plugin-usesend)](https://www.npmjs.com/package/@rokmohar/medusa-plugin-usesend)
[![npm downloads](https://img.shields.io/npm/dm/@rokmohar/medusa-plugin-usesend)](https://www.npmjs.com/package/@rokmohar/medusa-plugin-usesend)
[![CI](https://github.com/rokmohar/medusa-plugin-usesend/actions/workflows/ci.yml/badge.svg)](https://github.com/rokmohar/medusa-plugin-usesend/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@rokmohar/medusa-plugin-usesend)](./LICENSE)

Send Medusa email notifications through [useSend](https://usesend.com), the open-source email platform formerly
called Unsend. Write your emails as React components, and the plugin renders and sends them.

- [Features](#features)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Email templates](#email-templates)
- [Sending emails](#sending-emails)
- [Attachments](#attachments)
- [Migrating from @rokmohar/medusa-plugin-unsend](#migrating-from-rokmoharmedusa-plugin-unsend)
- [Self-hosting useSend](#self-hosting-usesend)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

- **Notification provider** for Medusa's notification module, on the `email` channel.
- **React email templates**, loaded from a folder and rendered to HTML with your app's own React.
- **Attachments** from Medusa's `createNotifications` call.
- **Retries** with exponential or linear backoff, so a short outage doesn't lose an email.
- **Rate limiting** per minute.
- **Per-environment overrides** of any option, keyed by `NODE_ENV`.
- Works with useSend Cloud and self-hosted useSend.

## Compatibility

| Plugin                                 | Medusa          |
| -------------------------------------- | --------------- |
| `@rokmohar/medusa-plugin-usesend` 2.x  | 2.22 or newer   |
| `@rokmohar/medusa-plugin-unsend` 1.1.x | 2.19 – 2.21     |
| `@rokmohar/medusa-plugin-unsend` 1.0.8 | 2.4 – 2.18      |
| `@rokmohar/medusa-plugin-unsend` 0.2.4 | 2.3.1 and older |

Node.js 22.22 or newer is required, the same as Medusa 2.22.

## Installation

```bash
npm install @rokmohar/medusa-plugin-usesend
```

Or with Yarn:

```bash
yarn add @rokmohar/medusa-plugin-usesend
```

## Quick start

1. Add your useSend credentials to `.env`:

   ```env
   USESEND_API_KEY=us_...
   USESEND_FROM=Shop <no-reply@example.com>
   # Only for self-hosted useSend; useSend Cloud is the default
   USESEND_URL=
   ```

2. Register the plugin and the notification provider in `medusa-config.ts`:

   ```ts
   import { defineConfig, loadEnv } from '@medusajs/framework/utils'
   import type { UseSendEmailOptions } from '@rokmohar/medusa-plugin-usesend'

   loadEnv(process.env.NODE_ENV || 'development', process.cwd())

   module.exports = defineConfig({
     // ... other config
     plugins: [
       {
         resolve: '@rokmohar/medusa-plugin-usesend',
         options: {
           url: process.env.USESEND_URL,
           api_key: process.env.USESEND_API_KEY ?? '',
           from: process.env.USESEND_FROM ?? '',
         } satisfies UseSendEmailOptions,
       },
     ],
     modules: [
       {
         resolve: '@medusajs/medusa/notification',
         dependencies: ['usesend'],
         options: {
           providers: [
             {
               resolve: '@rokmohar/medusa-plugin-usesend/providers/notification',
               id: 'usesend',
               options: {
                 channels: ['email'],
               },
             },
           ],
         },
       },
     ],
   })
   ```

3. Add a template to `src/templates/emails` (see [Email templates](#email-templates)) and send it from a subscriber
   or workflow (see [Sending emails](#sending-emails)).

The provider path is also exported as a constant, if you prefer it over the string:

```ts
import { USESEND_PROVIDER_PATH } from '@rokmohar/medusa-plugin-usesend'

// ...
{
  resolve: USESEND_PROVIDER_PATH,
  id: 'usesend',
  options: { channels: ['email'] },
}
```

## Configuration

| Option                   | Type     | Default                      | Description                                                           |
| ------------------------ | -------- | ---------------------------- | --------------------------------------------------------------------- |
| `api_key`                | `string` | required                     | useSend API key.                                                      |
| `from`                   | `string` | required                     | Default sender, e.g. `Shop <no-reply@example.com>`.                   |
| `url`                    | `string` | `https://app.usesend.com`    | API URL. Set it to your instance's URL when you self-host useSend.    |
| `templateDir`            | `string` | `<cwd>/src/templates/emails` | Folder the email templates are loaded from.                           |
| `retry.maxAttempts`      | `number` | `3`                          | Attempts per email, including the first one.                          |
| `retry.delay`            | `number` | `1000`                       | Delay before the first retry in ms.                                   |
| `retry.backoff`          | `string` | `'exponential'`              | `'exponential'` doubles the delay on every retry, `'linear'` adds it. |
| `rateLimit.maxPerMinute` | `number` | `60`                         | Maximum emails sent per minute. Further emails wait.                  |
| `environment`            | `object` | none                         | Overrides of any option above per `NODE_ENV`, see below.              |

The options are validated at startup, and an invalid configuration stops the server with a message listing every
problem.

### Per-environment overrides

`environment` takes `development`, `staging` and `production` keys. The overrides of the current `NODE_ENV` are
merged over the top-level options:

```ts
options: {
  api_key: process.env.USESEND_API_KEY ?? '',
  from: 'Shop <no-reply@example.com>',
  environment: {
    development: {
      from: 'Shop (dev) <dev@example.com>',
      rateLimit: { maxPerMinute: 10 },
    },
    production: {
      retry: { maxAttempts: 5, delay: 2000 },
    },
  },
}
```

## Email templates

At startup the plugin loads every `.tsx` and `.js` file in the template folder. Each file's default export is a React
component that receives the notification's `data` as props:

```tsx
// src/templates/emails/OrderPlaced.tsx
type Props = {
  display_id: number
  customer_name: string
}

const OrderPlaced = ({ display_id, customer_name }: Props) => {
  return (
    <div>
      <h1>Thanks for your order, {customer_name}!</h1>
      <p>Your order #{display_id} has been received.</p>
    </div>
  )
}

OrderPlaced.Subject = 'Your order has been received'

export default OrderPlaced
```

- The template name is the file name in kebab case: `OrderPlaced.tsx` becomes `order-placed`.
- Templates are rendered to HTML with your app's `react` and `react-dom`, so they work with
  [React Email](https://react.email) components.
- In production, Medusa compiles the templates to `.js` in `.medusa/server/src/templates/emails`, and the plugin loads
  those.

### Subject

The subject is taken from the first of these that is set:

1. `content.subject` in the `createNotifications` call
2. `subject` in the template's metadata file
3. The component's static `Subject` property
4. The template name, e.g. `order-placed`

### Metadata file

A JSON file with the same name next to the template is optional:

```json
// src/templates/emails/OrderPlaced.json
{
  "version": "1.0.0",
  "subject": "Your order has been received",
  "description": "Sent to the customer after checkout",
  "tags": ["order", "customer"],
  "category": "orders"
}
```

## Sending emails

Send an email through Medusa's notification module, with the template name and the data for its props:

```ts
// src/subscribers/order-placed.ts
import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { Modules } from '@medusajs/framework/utils'

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve('query')
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const {
    data: [order],
  } = await query.graph({
    entity: 'order',
    fields: ['display_id', 'email', 'shipping_address.first_name'],
    filters: { id: data.id },
  })

  await notificationModuleService.createNotifications({
    to: order.email,
    channel: 'email',
    template: 'order-placed',
    data: {
      display_id: order.display_id,
      customer_name: order.shipping_address?.first_name,
    },
  })
}

export const config: SubscriberConfig = {
  event: 'order.placed',
}
```

The plugin's service is registered in the container as `usesend`. Use it to register templates in code instead of
files, or to check that a template exists:

```ts
import type { UseSendService } from '@rokmohar/medusa-plugin-usesend'

const usesend = container.resolve<UseSendService>('usesend')

usesend.addTemplate('welcome', {
  subject: 'Welcome!',
  content: { html: '<p>Welcome to our shop.</p>' },
})
```

## Attachments

Pass attachments in the `attachments` field of `createNotifications`. Each one needs a `filename` and base64-encoded
`content`:

```ts
await notificationModuleService.createNotifications({
  to: 'customer@example.com',
  channel: 'email',
  template: 'invoice',
  attachments: [
    {
      filename: 'invoice-42.pdf',
      content: pdfBuffer.toString('base64'),
    },
  ],
})
```

useSend only accepts `filename` and `content`, so other fields of Medusa's attachment (`content_type`, `disposition`,
`id`) are ignored. Attachments in `data.attachments` are still read, for older code.

## Migrating from @rokmohar/medusa-plugin-unsend

Unsend was renamed to useSend, and this plugin was renamed with it in 2.0.0. Your templates and options don't change.

1. Swap the package:

   ```bash
   npm uninstall @rokmohar/medusa-plugin-unsend
   npm install @rokmohar/medusa-plugin-usesend
   ```

2. Rename in your code and `medusa-config.ts`:

   | 1.x (`@rokmohar/medusa-plugin-unsend`)                               | 2.x (`@rokmohar/medusa-plugin-usesend`)                                 |
   | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
   | `resolve: '@rokmohar/medusa-plugin-unsend'`                          | `resolve: '@rokmohar/medusa-plugin-usesend'`                            |
   | `'@rokmohar/medusa-plugin-unsend/providers/notification'`            | `'@rokmohar/medusa-plugin-usesend/providers/notification'`              |
   | `UNSEND_PROVIDER_PATH`                                               | `USESEND_PROVIDER_PATH`                                                 |
   | `dependencies: ['unsend']`                                           | `dependencies: ['usesend']`                                             |
   | `container.resolve('unsend')`                                        | `container.resolve('usesend')`                                          |
   | `UnsendService`                                                      | `UseSendService`                                                        |
   | `UnsendEmailOptions`, `UnsendEmailTemplate`, `UnsendEmailAttachment` | `UseSendEmailOptions`, `UseSendEmailTemplate`, `UseSendEmailAttachment` |

3. Optionally rename the provider `id` from `unsend` to `usesend`. Medusa stores the provider id on each sent
   notification, so keep `unsend` if you rely on filtering past notifications by provider.

4. Optionally rename your `UNSEND_*` environment variables to `USESEND_*`. The plugin only reads the values you pass in
   its options.

## Self-hosting useSend

useSend can run on your own server; it needs PostgreSQL, Redis and AWS SES. Follow the
[self-hosting guide](https://docs.usesend.com/self-hosting/overview), then set `url` to your instance, e.g.
`http://localhost:3000`.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) and the [GitHub releases](https://github.com/rokmohar/medusa-plugin-usesend/releases).

## Contributing

Bug reports, documentation fixes and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
development setup and the [code of conduct](./CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately, as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Rok Mohar
