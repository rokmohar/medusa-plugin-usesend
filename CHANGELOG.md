# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rokmohar/medusa-plugin-usesend/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/rokmohar/medusa-plugin-usesend/compare/v1.1.2...v2.0.0
