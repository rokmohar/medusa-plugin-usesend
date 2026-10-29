# Security policy

## Supported versions

Security fixes are released for the latest minor version.

| Version                                        | Supported |
| ---------------------------------------------- | --------- |
| `@rokmohar/medusa-plugin-usesend`, latest 2.x  | Yes       |
| `@rokmohar/medusa-plugin-unsend`, all versions | No        |

## Reporting a vulnerability

Do not report security vulnerabilities through public issues, discussions or pull requests.

Report them privately through GitHub's
[private vulnerability reporting](https://github.com/rokmohar/medusa-plugin-usesend/security/advisories/new).
Include:

- The affected plugin and Medusa versions
- A description of the issue and its impact, such as leaking the API key, or sending email to unintended recipients
- Steps to reproduce it, or a proof of concept

You can expect an acknowledgement within a few days. Once the issue is confirmed, a fix is prepared in a private
advisory, released, and the advisory is published with credit to the reporter unless they prefer otherwise.

## Scope

Vulnerabilities in Medusa itself belong with [Medusa](https://github.com/medusajs/medusa/security), and those in
useSend or its SDK with [useSend](https://github.com/usesend/useSend/security).
