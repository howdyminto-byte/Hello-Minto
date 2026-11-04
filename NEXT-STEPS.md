# Hello Minto v1.0.0 — current implementation and validation status

## Included in this package

- Public navigation emphasizes Sign In / Sign Up and listing a business; dashboard/admin controls are not presented as public navigation items.
- Sign-up creates a business-owner account and workspace; sign-in and role-based destinations use server-managed sessions.
- Business owners can submit listings for moderation review.
- Phone, email, WhatsApp, website, and Google Maps URL are captured independently. Public contact values remain hidden until their corresponding moderator approval is granted.
- Moderator controls approve contact fields individually and record review actions in the audit log.
- Enquiries remain visible in the owner dashboard. For accounts without an active subscription explicitly granting Lead Management, the API returns only masked references, status and date—not names, contact information or messages.
- A locked enquiry opens an upgrade prompt. Checkout and live subscription administration are not yet integrated.
- Added a local PostgreSQL 16 Docker Compose service and database helper scripts.
- Responsive styling for public pages, sign-in/sign-up, listing submission, dashboard and upgrade prompt.

## Validation status (read before deployment)

- ZIP integrity was checked.
- A full `npm install --ignore-scripts --no-audit --no-fund` attempt timed out in this environment. Dependencies are not installed here.
- Therefore a dependency-backed TypeScript check, Next.js production build, Prisma schema validation/client generation, migration, browser test and live API/database tests have **not** been completed. Do not treat the application as production-ready.
- No production/staging database, payment account, email provider, object storage, hosting, WordPress migration or DNS cutover is configured.

## Run locally

1. Install Node.js LTS and Docker Desktop (or Docker Engine with Compose).
2. Run `npm install`.
3. Copy `.env.example` to `.env`; generate a private random `AUTH_SECRET` of at least 32 characters. The database credentials in the example are for local development only.
4. Run `npm run db:up` and wait for the PostgreSQL container health check.
5. Run `npm run db:validate`, `npm run db:generate`, and `npm run db:migrate`.
6. Run `npm run typecheck` and `npm run build`; fix any errors before continuing.
7. Run `npm run dev`, then execute the smoke tests in `API-TESTING.md` with test accounts. Test that a basic-plan user cannot receive lead PII through either the UI or API, and that each contact field remains hidden until approved.
8. Create the first super-admin only in a controlled environment using the guarded bootstrap script; never grant privileged roles through public sign-up.

## Before production

- Configure managed PostgreSQL, TLS, backups and a tested restore procedure.
- Add durable rate limiting, email verification, password recovery, bot/abuse controls, and operational monitoring before enabling public registration.
- Connect and test payment checkout, signed/idempotent webhooks, subscription renewal/expiry jobs, email delivery and object storage.
- Review migration SQL and run it in staging before production. This package does not include a production baseline migration or a configured database.
- Complete role/organization/plan authorization tests, XSS/CSRF checks, accessibility and responsive browser QA, SEO/redirect checks, and a rollback rehearsal.
- Do not migrate plaintext passwords or payment-card data. Do not claim historical payments were verified unless there is authoritative evidence.
