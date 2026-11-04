# Security implementation checklist

This repository is a development foundation. Do not expose it to production traffic until the items below have been implemented and tested.

- [ ] Complete login, logout, password reset, email verification and secure session issuance/revocation.
- [ ] Use Argon2id or an appropriately configured bcrypt implementation for password hashes.
- [ ] Set session cookies HttpOnly, Secure in production, SameSite, Path=/ and an explicit expiry.
- [ ] Require MFA for privileged roles and rate-limit authentication and sensitive operations.
- [ ] Enforce permissions and organization/resource ownership in every server action and API route.
- [ ] Validate request data on the server; sanitize rich text before rendering; protect state-changing routes against CSRF.
- [ ] Validate upload type, size and content; store files outside the app server and scan as appropriate.
- [ ] Verify payment webhook signatures and use idempotency keys; never trust browser redirect success as payment evidence.
- [ ] Keep secrets out of source control, logs, browser bundles and error responses.
- [ ] Add audit events for privileged actions without storing passwords, session tokens, or unnecessary personal data.
- [ ] Configure database least privilege, backups, restore drills, monitoring and alerting.
- [ ] Run dependency, static, accessibility, integration and security tests before launch.
