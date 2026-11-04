# Hello Minto — Vercel deployment checklist

This is deployment preparation for the existing Next.js project. The UI has not been redesigned.

## Current readiness

- Source-code starter only; not deployed.
- `prisma/schema.prisma` exists, but there is no checked-in `prisma/migrations/` directory.
- A full production build, database migration, authentication flow, and role-based access have not been verified.
- Do not direct real users to the site until the checks below pass.

## 1. Create the GitHub repository

1. Sign in to GitHub and create a **private** repository named `hello-minto`.
2. Do not initialize it with a README, license, or `.gitignore` (the project already contains these).
3. Push this project folder to the repository. Never upload `.env` or real credentials.

## 2. Set up managed PostgreSQL

Use a managed provider such as Neon, Supabase, or Vercel's database marketplace. Create a database and copy its TLS-enabled PostgreSQL connection string; keep it private.

Install and validate locally:

```bash
npm install
npm run db:validate
npm run db:generate
```

Create and review an initial Prisma migration against a development/staging database and commit `prisma/migrations/`. The current project has no committed migration history, so this must happen before production can be initialized safely.

For production releases, use:

```bash
npx prisma migrate deploy
```

Do not run `prisma migrate dev` against production.

## 3. Import into Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import the `hello-minto` GitHub repository.
3. Framework preset: **Next.js**. Build command: `npm run build`; install command: `npm install`.
4. Add environment variables to Preview first, then Production after staging verification:
   - `DATABASE_URL` — managed PostgreSQL connection string
   - `AUTH_SECRET` — unique random secret, at least 32 characters
   - `APP_URL` — deployed URL, including `https://`
   - `CRON_SECRET` — separate random secret of at least 32 characters if scheduled publishing is enabled
5. Deploy a Preview and review the build logs.

Ensure Prisma Client generation is part of install/build (for example, `postinstall: prisma generate`, or a Vercel build command that runs `prisma generate && next build`). Verify this in CI before production. Never prefix database credentials with `NEXT_PUBLIC_`.

Generate secrets using a password manager or a cryptographically secure generator. Do not paste secrets into chat or commit them.

## 4. Test before public launch

- Sign-up, sign-in, sign-out, session expiry, and invalid credentials
- Role/permission boundaries for owner, moderator, and super-admin
- One-time super-admin provisioning; remove bootstrap variables immediately afterward
- Listing submission, moderation, and public contact visibility approvals
- Owner lead access and plan entitlements; confirm locked lead fields are not returned by the API
- Blog drafts, revisions, publishing permissions, and scheduled publishing
- Rate limiting, email verification/recovery, privileged-account MFA, backups, monitoring, and rollback

Some billing/subscription, SEO/migration, and CMS areas remain illustrative or require integrations. Do not advertise them as fully operational until implemented and tested.

## 5. Custom domain

After staging passes, add the domain in Vercel Project → Settings → Domains, follow the DNS records Vercel shows, and update `APP_URL` to the canonical HTTPS domain. Keep the current website unchanged until the new deployment and database migration are approved.
