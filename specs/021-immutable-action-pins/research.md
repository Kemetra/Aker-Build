# Research: Immutable GitHub Action Pins

## GitHub security guidance

GitHub documents that pinning an action to a full commit SHA guarantees the exact
reviewed code and supports repository/enterprise policies that require all
actions, including GitHub-authored actions, to use full-length SHAs.

Primary references:

- <https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats>
- <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository>

## Selected releases

Direct official-remote verification on 2026-07-20:

```text
actions/checkout v6.0.2
de0fac2e4500dabe0009e67214ff5f5447ce83dd

actions/setup-node v6.4.0
48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
```

Checkout v6 and setup-node v6 use the Node 24 action runtime and require modern
runner versions. All affected jobs use GitHub-hosted `ubuntu-latest` or
`windows-latest`, so no self-hosted compatibility claim is introduced.

## Update policy

Action updates are explicit reviewed changes: inspect an official release,
resolve its full tag SHA directly from the official remote, update the SHA and
release comment together, and run the static/full verification matrix. Major
tags and automated unreviewed refreshes remain forbidden.
