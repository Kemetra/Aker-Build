# Security Policy

## Supported version

Aker Build is pre-1.0. The latest revision on `main` is the only supported line; older commits and
unreleased forks do not receive separate security fixes.

## Report a vulnerability privately

Use the repository's **Security** tab and open a private GitHub Security Advisory. Do not disclose a
vulnerability in a public issue before a fix or coordinated disclosure is ready.

Never include real tokens, private keys, webhook secrets, repository source, customer data, or a
working exploit secret in an issue, log, screenshot, test fixture, or proof of concept. Use obvious
sentinel values and the minimum reproduction necessary.

Please include the affected component, impact, reproduction conditions, and any suggested mitigation.
The maintainer will acknowledge a usable private report as capacity allows and coordinate status and
disclosure through the advisory. This project does not promise a fixed response-time SLA.

## Security boundaries

The GitHub App is report-only: its only GitHub writes are Checks create/update. A security report is
especially important if behavior could expose a credential or source content, bypass webhook
verification, escape an ephemeral workspace, execute an agent, or mutate repository/merge state.
