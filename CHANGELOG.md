# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-10-29

### Added

- Translated templates: `OrderPlaced.sl.tsx` is used for notifications with the `sl` locale, from `provider_data.locale`
  or `data.locale`, with the new `defaultLocale` option as the fallback.
- Per-email options in `provider_data`: `replyTo`, `cc`, `bcc`, `headers` and `scheduledAt`.
- useSend dashboard templates, sent with `provider_data.templateId` and `variables`.
- `dryRun` and `redirectTo` options, to log emails or send them all to one address.
- Delivery webhooks: with the `webhook_secret` option, `/hooks/usesend` verifies useSend's calls and emits them as
  `usesend.<type>` events, e.g. `usesend.email.bounced`, with the matching notification id.
- `upsertContact` and `removeContact` on the `usesend` service, with the `contacts.contactBookId` option.
- Settings → useSend admin page to preview templates and send a test.
- A plain-text part in every email.
- Unit tests, run in CI.

### Changed

- The notification's `content.html` and `content.text` override what the template renders, and an email with
  `content.subject` and `content.html` no longer needs a template. Before, they were ignored.
- Only network errors, server errors and rate limiting are retried. Errors such as an invalid recipient fail at once.

### Fixed

- A retry after a lost response no longer sends the email twice: the notification id is sent as idempotency key.
- One template that fails to load no longer stops the templates after it from loading. The log names the file.
- Template warnings go through Medusa's logger instead of the console.
- The admin extensions are exported, so Medusa finds them.

## [2.0.0] - 2026-10-29

Unsend was renamed to useSend, and the plugin is now published as `@rokmohar/medusa-plugin-usesend`. See
[Migrating from @rokmohar/medusa-plugin-unsend](./README.md#migrating-from-rokmoharmedusa-plugin-unsend).

### Changed

- **Breaking:** renamed the package to `@rokmohar/medusa-plugin-usesend`.
- **Breaking:** renamed the exports `UnsendService`, `UNSEND_PROVIDER_PATH`, `UnsendEmailOptions`,
  `UnsendEmailTemplate` and `UnsendEmailAttachment` to `UseSendService`, `USESEND_PROVIDER_PATH`,
  `UseSendEmailOptions`, `UseSendEmailTemplate` and `UseSendEmailAttachment`.
- **Breaking:** the service is registered in the container as `usesend` instead of `unsend`, and the notification
  provider's identifier is `notification-usesend`.
- **Breaking:** requires Medusa 2.22 or newer and Node.js 22.22 or newer.
- Switched from the `unsend` SDK to `usesend-js` 1.6.3. Without `url`, emails go to `https://app.usesend.com`.
- Updated `@react-email/render` to 2.2.0.
- Removed the unused peer dependencies `@medusajs/admin-sdk`, `@medusajs/icons` and `@medusajs/ui`.

### Fixed

- The `retry.backoff` option is applied. Before, retries always used exponential backoff, and the documented default
  was `linear`. The default stays `exponential`, and an unknown value is rejected at startup.
- Removed an unused second rate limiter from the service.

### Added

- License file, contributing guide, code of conduct, security policy, and issue and pull request templates.

## Earlier versions

Versions up to 1.1.2 were published as
[`@rokmohar/medusa-plugin-unsend`](https://www.npmjs.com/package/@rokmohar/medusa-plugin-unsend). Their notes are in
the [GitHub releases](https://github.com/rokmohar/medusa-plugin-usesend/releases).

[Unreleased]: https://github.com/rokmohar/medusa-plugin-usesend/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/rokmohar/medusa-plugin-usesend/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/rokmohar/medusa-plugin-usesend/compare/v1.1.2...v2.0.0
