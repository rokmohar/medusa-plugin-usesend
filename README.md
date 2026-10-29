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
- [Testing without sending](#testing-without-sending)
- [Delivery webhooks](#delivery-webhooks)
- [Contacts](#contacts)
- [Admin page](#admin-page)
- [Migrating from @rokmohar/medusa-plugin-unsend](#migrating-from-rokmoharmedusa-plugin-unsend)
- [Self-hosting useSend](#self-hosting-usesend)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

- **Notification provider** for Medusa's notification module, on the `email` channel.
- **React email templates**, loaded from a folder and rendered to HTML and plain text with your app's own React.
- **Translated templates**: `OrderPlaced.sl.tsx` is picked for Slovenian customers.
- **useSend dashboard templates**, sent by id with variables.
- **Per-email options**: reply-to, CC, BCC, headers and scheduled sending.
- **Attachments** from Medusa's `createNotifications` call.
- **Safe retries**: temporary failures are retried with backoff, and an idempotency key keeps a retry from sending
  the email twice.
- **Mailpit, dry run and redirect modes** for development and staging.
- **Delivery webhooks**: bounces, complaints, opens and clicks become Medusa events.
- **Contacts**: add newsletter subscribers to a useSend contact book.
- **Admin page** to preview templates and send yourself a test.
- **Rate limiting** per minute, and **per-environment overrides** of any option.
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

| Option                   | Type      | Default                      | Description                                                           |
| ------------------------ | --------- | ---------------------------- | --------------------------------------------------------------------- |
| `api_key`                | `string`  | required                     | useSend API key. Not needed with `mailpitUrl` or `dryRun`.            |
| `from`                   | `string`  | required                     | Default sender, e.g. `Shop <no-reply@example.com>`.                   |
| `url`                    | `string`  | `https://app.usesend.com`    | API URL. Set it to your instance's URL when you self-host useSend.    |
| `templateDir`            | `string`  | `<cwd>/src/templates/emails` | Folder the email templates are loaded from.                           |
| `retry.maxAttempts`      | `number`  | `3`                          | Attempts per email, including the first one.                          |
| `retry.delay`            | `number`  | `1000`                       | Delay before the first retry in ms.                                   |
| `retry.backoff`          | `string`  | `'exponential'`              | `'exponential'` doubles the delay on every retry, `'linear'` adds it. |
| `rateLimit.maxPerMinute` | `number`  | `60`                         | Maximum emails sent per minute. Further emails wait.                  |
| `defaultLocale`          | `string`  | none                         | Locale used when a notification has none, see [Locales](#locales).    |
| `dryRun`                 | `boolean` | `false`                      | Log emails instead of sending them.                                   |
| `mailpitUrl`             | `string`  | none                         | Send every email to this Mailpit instead, see below.                  |
| `redirectTo`             | `string`  | none                         | Send every email to this address instead.                             |
| `webhook_secret`         | `string`  | none                         | Signing secret that turns on [delivery webhooks](#delivery-webhooks). |
| `contacts.contactBookId` | `string`  | none                         | Default contact book for [contacts](#contacts).                       |
| `environment`            | `object`  | none                         | Overrides of any option above per `NODE_ENV`, see below.              |

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

### Locales

Add a locale to the file name for a translated variant: `OrderPlaced.sl.tsx` is the Slovenian `order-placed`, and
`OrderPlaced.sl.json` holds its metadata, on top of `OrderPlaced.json`.

The locale is read from `provider_data.locale`, or else `data.locale`, of the notification. The plugin uses the first
variant that exists:

1. The exact locale, e.g. `sl-si`
2. Its language, e.g. `sl`
3. The `defaultLocale` option
4. The template without a locale

### Preview data

The [admin page](#admin-page) fills a template with sample data. Set it as a static `PreviewProps` on the component,
the same as [React Email](https://react.email) does, or as `previewProps` in the metadata file:

```tsx
OrderPlaced.PreviewProps = {
  display_id: 1001,
  customer_name: 'Ana',
}
```

A broken template doesn't keep the others from loading: the plugin logs which file failed and why.

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

Every email has an HTML and a plain-text part. The `content` of the notification overrides the template: `content.html`
and `content.text` replace what the template renders, and an email with `content.subject` and `content.html` needs no
template at all.

### Per-email options

Pass options for one email in `provider_data`:

```ts
await notificationModuleService.createNotifications({
  to: order.email,
  channel: 'email',
  template: 'order-placed',
  data: { display_id: order.display_id },
  provider_data: {
    replyTo: 'support@example.com',
    bcc: 'orders@example.com',
    headers: { 'X-Entity-Ref-ID': order.id },
    scheduledAt: '2026-11-01T09:00:00Z',
    locale: 'sl',
  },
})
```

`replyTo`, `cc` and `bcc` take an address or a list of addresses. Invalid `provider_data` fails the notification
without sending it.

### useSend dashboard templates

To send a template you edit in the useSend dashboard instead of a file, pass its id and variables. Nothing is rendered
locally, and the subject comes from the useSend template unless `content.subject` is set:

```ts
await notificationModuleService.createNotifications({
  to: customer.email,
  channel: 'email',
  template: 'welcome',
  provider_data: {
    templateId: 'tmpl_123',
    variables: { firstName: customer.first_name },
  },
})
```

### The `usesend` service

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

## Testing without sending

Three options keep test emails away from real customers. All of them can be set per environment:

- `mailpitUrl: 'http://localhost:8025'` sends every email to [Mailpit](https://mailpit.axllent.org), a local inbox, see
  below.
- `dryRun: true` logs each email (recipient, subject and template) instead of sending it.
- `redirectTo: 'dev@example.com'` sends every email to one address. The original recipients go into an
  `X-Original-To` header, and CC and BCC are dropped.

```ts
options: {
  api_key: process.env.USESEND_API_KEY ?? '',
  from: 'Shop <no-reply@example.com>',
  environment: {
    development: { dryRun: true },
    staging: { redirectTo: 'qa@example.com' },
  },
}
```

### Mailpit

[Mailpit](https://mailpit.axllent.org) catches the emails in a web inbox, where you can read the HTML and plain text
and open the attachments. Run it next to your database, e.g. in `docker-compose.yml`:

```yml
services:
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - '127.0.0.1:8025:8025'
```

Then set `mailpitUrl` for local development. The plugin sends through Mailpit's HTTP API, so no useSend API key is
needed, and the inbox is at `http://localhost:8025`:

```ts
options: {
  api_key: process.env.USESEND_API_KEY,
  from: 'Shop <no-reply@example.com>',
  mailpitUrl: process.env.MAILPIT_URL, // http://localhost:8025 in your local .env
}
```

Each email is tagged with its template name. A useSend dashboard template can't be rendered locally, so it arrives
as text with the template id and variables.

Keep a local Mailpit bound to localhost, because it accepts email from anyone who can reach it. To use a Mailpit on a
server, for example for staging, protect it with logins: `MP_UI_AUTH_FILE` for the inbox, and `MP_SEND_API_AUTH` for
a login that can only send. Then put the send login in the URL:

```env
MAILPIT_URL=https://sender:s3cret%24pass@mailpit.example.com
```

The plugin sends it as a Basic auth header, and the admin page shows the URL without it. Percent-encode special
characters in the login: Medusa's `loadEnv` expands `$`, so write `$` as `%24`.

## Delivery webhooks

The plugin turns useSend webhook calls into Medusa events, so you can react to bounces, complaints, opens and clicks.

1. In the useSend dashboard, add a webhook pointing at `https://<your-medusa>/hooks/usesend` and copy its signing
   secret.
2. Set the `webhook_secret` option to it. Without it, the route responds 404.

Every call is verified and emitted as `usesend.<type>`, e.g. `usesend.email.bounced`. The event names are exported as
`USESEND_WEBHOOK_EVENTS`:

```ts
// src/subscribers/email-bounced.ts
import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { USESEND_WEBHOOK_EVENTS, type UseSendWebhookEventData } from '@rokmohar/medusa-plugin-usesend'

export default async function emailBounced({ event, container }: SubscriberArgs<UseSendWebhookEventData>) {
  const { notification_id, to, data } = event.data

  container.resolve('logger').warn(`Email ${notification_id} to ${to.join(', ')} bounced: ${JSON.stringify(data)}`)
}

export const config: SubscriberConfig = {
  event: USESEND_WEBHOOK_EVENTS.EMAIL_BOUNCED,
}
```

The event data holds `call_id`, `type`, `email_id`, `notification_id` (the Medusa notification that sent the email,
when there is one), `to`, `status` and the raw useSend `data`. useSend can deliver a call more than once, so use
`call_id` to skip duplicates.

## Contacts

Add the people who sign up for your newsletter to a useSend contact book, so you can send them campaigns from useSend.
The plugin doesn't sync customers on its own, because Medusa has no newsletter consent; call it from your own sign-up
flow:

```ts
const usesend = container.resolve<UseSendService>('usesend')

await usesend.upsertContact({
  email: 'ana@example.com',
  firstName: 'Ana',
  subscribed: true,
  properties: { locale: 'sl' },
})
```

`upsertContact` creates the contact, or updates the one with the same email, in the contact book of the
`contacts.contactBookId` option, or the one passed as the second argument. `removeContact(contactId)` removes one.

## Admin page

**Settings → useSend** in the Medusa admin lists the loaded templates and shows whether the plugin is live, in dry run
or redirecting. For each template you can edit the sample data, pick a locale, preview the HTML and plain text, and
send a test to yourself. Test emails go through the notification module, so they show up in the notification log and
follow `dryRun` and `redirectTo`.

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
