# Hello Minto platform — v1.0.0 local setup and lead entitlement phase

A new, independent Next.js platform foundation for Hello Minto. This is intended to replace WordPress at runtime, not run as a headless WordPress frontend.

## What's in this iteration

- Independent Next.js app intended to replace WordPress at runtime; WordPress is only a possible one-time migration source.
- Responsive public directory homepage (`/`) and public blog routes (`/blog`, `/blog/[slug]`).
- Responsive admin workspace (`/admin`) with live API integration for business listing moderation and Blog CMS; subscriptions, migration, SEO redirects, user management and audit-log screens remain illustrative UI where noted.
- Server-managed login/logout/session identity, scrypt password verification, opaque HttpOnly session cookie, permission checks, and guarded initial-admin CLI provisioning.
- PostgreSQL/Prisma data model for users, organizations, businesses, plans, subscriptions, payments/webhooks, blog posts/revisions, media assets, leads, SEO and audit records.
- Blog draft/save, SEO metadata, revision history and restore-to-draft; publish and schedule permissions; public article API/pages; trusted scheduler endpoint.
- Authenticated server-side media upload to S3-compatible object storage with 10 MB limit and binary signature checks.
- API testing notes, security notes and environment template.

**Status:** source-code starter only. No production database, storage bucket, scheduler, hosting, WordPress migration or production cutover has been configured. A complete dependency-backed build and production test suite have not yet been verified in this workspace.
## Run locally

Prerequisite: Node.js 20.9+ and npm.

```bash
# 1. Install JavaScript dependencies
npm install

# 2. Start a local-only PostgreSQL database (Docker required)
npm run db:up

# 3. Create your local environment file and set a private random AUTH_SECRET (32+ characters)
# Windows PowerShell: Copy-Item .env.example .env
# macOS/Linux: cp .env.example .env

# 4. Validate the Prisma schema, generate the client, and create the initial development migration
npm run db:validate
npm run db:generate
npm run db:migrate

# 5. Start the site
npm run dev
```

Open `http://localhost:3000` for the public homepage. Admin routes require an authenticated account with the appropriate server-side role.

## Database setup

1. Provision PostgreSQL and set `DATABASE_URL` in `.env`.
2. Review `prisma/schema.prisma` and align it with the final migration mapping and billing policy.
3. Run:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate dev --name initial_schema
```

The Prisma schema was included from the previous starter iteration but its validation did not complete in that environment. Run the commands above locally and fix any reported schema issues before migration or production use.

## Authentication and authorization boundary

Login, logout, session identity, scrypt password verification, opaque session tokens and server-side permission checks are implemented as a foundation. Before production, add durable login rate limiting, administrator MFA, invitation/email verification and recovery flows, review the origin/CSRF behavior behind the production proxy, and complete role/resource integration tests. Do not rely on hidden UI controls for authorization.

## Production implementation still required

This is a source-code foundation and interactive prototype, not a production-ready service. Before public launch:

- Add secure session rotation/revocation, administrator MFA, durable rate limits, invitation/recovery flows, and a reviewed CSRF/origin strategy.
- Finish connecting remaining UI screens to server-side APIs; subscriptions, user management, SEO redirects and migration screens are not yet fully operational. Demo values must not be treated as live records.
- Replace the plain-text blog editor with a full WYSIWYG/block editor, and add autosave, image insertion/featured-image assignment, category/tag management, and richer content validation.
- Add automated upload security tests and decide whether malware scanning is required for the production media pipeline.
- Implement Razorpay only after confirming plan prices, taxes, renewal and cancellation policy. Verify webhook signatures, enforce idempotency, reconcile payments and separate payment, subscription and listing-visibility states.
- Build and test a WordPress export/import pipeline. Audit plugins, custom fields, existing URLs, media, user roles, and historical payment evidence first. Never import plaintext passwords or payment-card data.
- Validate redirects, canonical URLs, sitemap, robots rules, metadata and structured data against the current site's URL inventory.
- Add automated tests, observability, backups, restore drills, accessibility checks, security review and a tested rollback plan.

## Design / content notes

The public page includes sample business profiles and sample figures purely for layout validation. Replace them with imported and verified data. Do not present these sample listings, metrics, ratings or subscriptions as live/verified business information.

## API foundation (v0.3)

The project now includes server routes for a first integration pass:

- `GET /api/health` — readiness probe that reports whether PostgreSQL is reachable without exposing secrets.
- `GET /api/listings?q=&city=&category=&limit=` — returns only `PUBLISHED` listings; the limit is capped at 50.
- `POST /api/listings` — requires an active database session and a listing-write/moderation permission. Business owners must provide an organization they belong to; owner access is checked server-side.
- `POST /api/auth/login` — verifies a scrypt password hash and issues a random opaque token in an HttpOnly, SameSite=Strict cookie; only the SHA-256 token hash is stored in the database.
- `POST /api/auth/logout` — deletes the current server session and expires the cookie.

### Password hash format

Use `hashPassword()` from `lib/auth/password.ts` in a trusted server-side provisioning or invitation workflow. It returns `scrypt$<salt-hex>$<derived-key-hex>`. Passwords are never returned by an API. There is deliberately no public registration or bootstrap-admin endpoint in this starter; provision the first administrator through a controlled, one-time operational process.

### Before exposing these endpoints publicly

1. Install dependencies and run `npm run db:validate`, `npm run db:generate`, `npm run typecheck`, and `npm run build`.
2. Configure a managed PostgreSQL database and apply a reviewed migration (`npm run db:migrate` in a development environment).
3. Add a durable IP/account-aware login rate limiter, email verification/invitation flows, administrator MFA, session rotation/revocation policy, and monitoring before production.
4. Test same-origin behavior behind the actual hosting proxy, and add a CSRF strategy appropriate to any cross-origin clients.
5. Add integration tests for role and organization boundaries, malformed payloads, duplicate slugs, expired sessions, and unavailable database behavior.
6. Implement server-side moderation routes, upload scanning/storage, billing/webhooks and renewal jobs before enabling those product areas.

The API files are source code only until dependencies and a real PostgreSQL database are configured. This package has not been certified by a production security review.

## Controlled initial administrator setup (v0.4)

A one-time CLI script can create the first `SUPER_ADMIN` without exposing a public bootstrap endpoint. It refuses to run unless the explicit confirmation variable is present, and refuses to overwrite an existing account.

1. Configure `.env` with a working PostgreSQL `DATABASE_URL` and the four bootstrap variables shown in `.env.example`. Use a unique password of at least 16 characters from a secure password manager; do not commit `.env` or paste secrets into chat.
2. Install dependencies and generate the Prisma client (`npm install`, then `npm run db:generate`). Apply a reviewed database migration first.
3. Run `npm run admin:bootstrap` once.
4. Remove `BOOTSTRAP_ADMIN_CONFIRM`, `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` from the environment after success. Verify login and role assignment, then use the normal operational process for future users.

The script creates only the initial administrator and its role assignment. It does not create a public registration flow, send invitations, or enable MFA. A production launch still requires MFA for privileged accounts, a durable login rate limiter, recovery procedures, and integration/security testing.

### Session identity endpoint (v0.4)

- `GET /api/auth/me` returns the current authenticated user and role keys, or `401` with `{ "user": null }`. It never returns the cookie/session token and uses `Cache-Control: no-store`.

### Listing moderation API (v0.5)

- `GET /api/admin/listings` — authenticated moderators/super-admins can filter by status or text and page through listings.
- `PATCH /api/admin/listings/:id` — moderators/super-admins can change moderation status using explicit allowed transitions; requesting changes or rejecting requires a note.
- Status changes and `AuditLog` entries are written atomically. This API is separate from billing/subscription status.
- The admin UI can connect to these endpoints in live mode; without a configured database/session, it remains in explicitly labelled demo mode.


## v0.6.0 — live admin listings connection

The admin workspace now has a **Connect live data** sign-in panel. It uses `POST /api/auth/login`, confirms the session with `GET /api/auth/me`, and loads up to 100 records from `GET /api/admin/listings?limit=100`. The refresh action reloads database records. Moderation buttons call `PATCH /api/admin/listings/:id`; actions shown in live mode follow the server-side transition matrix, and changes/rejections request a note. Sign-out calls `POST /api/auth/logout` and returns the screen to demo data.

Live mode requires the app to be running with a working PostgreSQL connection, applied Prisma schema, and an already-provisioned account with `listings:read:any` and `listings:moderate` permissions. The login panel intentionally has no default/demo credentials. This connects the **Business listings** screen only; the remaining CMS sections still contain illustrative preview data.


## v0.7.0 — Database-backed Blog CMS API

The Blog CMS now has authenticated API endpoints backed by the independent PostgreSQL database:

- `GET /api/admin/posts` — permission-checked article list with search/status filtering and bounded results.
- `POST /api/admin/posts` — create an article draft/review/published record (publishing requires `posts:publish`).
- `PATCH /api/admin/posts/:id` — update an article, SEO title/description, rendered safe plain-text HTML, revision history, and audit log.
- The admin Blog CMS includes article loading/selection, database saves, SEO fields, scheduling, media-library controls and revision restore UI when live mode is connected. Demo mode remains clearly non-persistent.
- Content is stored as a structured JSON text envelope and rendered as paragraphs without injecting article HTML. This is not yet a full rich-text block editor; automatic image insertion/featured-image assignment and tags/categories management remain future work.

As with prior versions, a production database and full dependency-backed build have not been validated in this workspace. Configure `.env`, install dependencies, generate Prisma Client, apply migrations, and test with provisioned role-based accounts before production use.

## v0.8.0 — Publishing workflow and media library

This phase adds:

- Public, server-rendered journal pages at `/blog` and `/blog/[slug]`, showing only published articles whose publication time has arrived and whose SEO record permits indexing.
- Public JSON endpoints `GET /api/blog` and `GET /api/blog/[slug]` for published content.
- Scheduled article status with required future `scheduledAt`, server-side publishing permission checks, and a scheduler endpoint `POST /api/internal/publish-scheduled`.
- Revision history listing and revision restoration as a new draft, with an audit entry.
- Authenticated image upload and media-library endpoints backed by S3-compatible object storage. Accepted types are JPEG, PNG, WebP and GIF, limited to 10 MB; SVG is rejected. The server checks the file signature before uploading.

### Configure object storage

Set `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`, and `OBJECT_STORAGE_PUBLIC_BASE_URL`. Set `OBJECT_STORAGE_ENDPOINT` only for an S3-compatible provider with a custom endpoint. The configured public base URL must serve the uploaded object keys; configure bucket/CDN access and HTTPS appropriately. Use a dedicated least-privilege service account limited to the media bucket/prefix. Do not commit these values to source control.

### Configure scheduled publishing

Set `CRON_SECRET` to a random secret with at least 32 characters. Configure a trusted scheduler (hosting cron or an external scheduler) to send a `POST` request to `/api/internal/publish-scheduled` with `Authorization: Bearer <CRON_SECRET>`. Invoke it every minute or every few minutes according to the hosting plan. Do not expose the secret in client code. The endpoint processes at most 100 due articles per invocation and is safe to retry; ensure the scheduler continues running until the queue is empty.

### Database setup after schema changes

With dependencies installed and a PostgreSQL database configured, run `npm run db:validate`, then `npm run db:migrate` in a development environment and `npm run db:generate`. Review the generated migration before applying it to staging or production. This starter does not include a baseline production migration or a configured database.

The editor still stores article text in the current structured JSON envelope; a full WYSIWYG editor and richer block-based content schema remain a separate task. Media assets are uploaded to object storage and the UI exposes their URLs, but automatic inline insertion/featured-image assignment is not yet wired.

## Authentication, business submission, contact visibility and lead entitlements

- Public navigation uses Sign in / List your business; CMS/dashboard links are not promoted on the public homepage.
- `POST /api/auth/signup` creates a business-owner account, workspace, membership, hashed-password record, and server-side session. Passwords are never stored in plaintext. Configure rate limiting and email verification before public launch.
- `/dashboard/add-business` submits a business listing only for an authenticated account. New listings enter `PENDING_REVIEW`. Contact fields are stored but all public-contact approvals default to false.
- Moderators can use `PATCH /api/admin/listings/:id` with `contactVisibility: { phone, email, whatsapp, map }` to approve or revoke each field. The operation is audited. Public `GET /api/listings` returns only contact values whose approval flag is true.
- `/dashboard` reads `/api/owner/leads`. The endpoint checks organization membership and the business's active subscription feature JSON. It returns only reference/status/date for locked leads; names, contact strings, and messages are omitted from the response unless the active plan explicitly sets `leadManagement: true`, `lead_management: true`, or `leads: true`.
- Upgrade UI is a design and entitlement flow only. Live plan selection, payment checkout, subscription renewal, and entitlement synchronization still need implementation and production credentials.

After changing `prisma/schema.prisma`, run `npm run db:validate`, `npm run db:generate`, then create and apply a migration with `npm run db:migrate` in a configured development environment. These commands have not been run in this artifact because database credentials and installed dependencies are not present here.


## Local database helper

`compose.yaml` provides a development-only PostgreSQL 16 service bound to `127.0.0.1`. Its credentials are for local development only and must never be reused in staging or production. Use `npm run db:up`, `npm run db:logs`, and `npm run db:down` to manage the service. `npm run db:reset:local` deletes the local database volume and all local database data; use it only when you intentionally want a full local reset. Production should use a managed PostgreSQL instance with unique credentials, TLS, backups, and restricted network access.
