# Multi-Tenant SaaS Basic Example

This is a small, sanitized SaaS-shaped fixture for TenantGuard first-run demos.

It intentionally includes detectable signals:

- A frontend file importing backend internals.
- API routes without auth/role guards.
- A webhook/payment path without replay protection.
- Tenant-scoped schema fields.

It is not a runnable product and contains no credentials, private project details, or domain-specific business logic.
