# Hello Minto API smoke tests

Run after configuring `.env`, installing dependencies, generating the Prisma client and starting the app with `npm run dev`.

## Readiness

```sh
curl -i http://localhost:3000/api/health
```

Expect `200` and `{"status":"ok","database":"connected"}` when PostgreSQL is available; expect `503` when the database is unavailable.

## Public listings

```sh
curl -i 'http://localhost:3000/api/listings?city=Nagpur&limit=10'
```

Only published database listings are returned. An empty array is expected in a fresh database.

## Login/logout

```sh
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"REPLACE_WITH_PROVISIONED_PASSWORD"}' \
  http://localhost:3000/api/auth/login

curl -i -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

There is no built-in default admin account. Provision accounts using a controlled server-side process; never use a guessed or default password.

## Create listing (authenticated)

```sh
curl -i -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"Sample Business","slug":"sample-business","city":"Nagpur","organizationId":"YOUR_ORGANIZATION_ID"}' \
  http://localhost:3000/api/listings
```

These are smoke-test examples, not evidence that the endpoints have been executed. Add automated integration tests before relying on them.

### Current session identity

```bash
curl -i -b cookies.txt http://localhost:3000/api/auth/me
```

Expected: `200` with a user and role keys for a valid session; `401` with `user: null` when signed out or expired. This is a test recipe, not evidence that the endpoint has been run.

### Controlled initial administrator

After configuring `.env`, applying a reviewed migration and generating Prisma Client, set the one-time variables from `.env.example` and run `npm run admin:bootstrap`. Never use real secrets in source control. The script refuses to modify an existing account.

## Admin listing moderation (v0.5)

All examples require an authenticated session cookie from the login endpoint. The admin listing endpoints are not public.

```bash
# Browse the moderation queue (optionally filter by status or text)
curl -i -b cookies.txt 'http://localhost:3000/api/admin/listings?status=PENDING_REVIEW&limit=30'
curl -i -b cookies.txt 'http://localhost:3000/api/admin/listings?q=clinic'

# Approve/publish a listing (replace LISTING_ID)
curl -i -b cookies.txt -X PATCH 'http://localhost:3000/api/admin/listings/LISTING_ID' \
  -H 'Content-Type: application/json' \
  --data '{"status":"PUBLISHED"}'

# Request changes; a short note is required
curl -i -b cookies.txt -X PATCH 'http://localhost:3000/api/admin/listings/LISTING_ID' \
  -H 'Content-Type: application/json' \
  --data '{"status":"CHANGES_REQUESTED","note":"Please add a working phone number and complete address."}'
```

Moderation requires the `listings:moderate` permission. Invalid transitions return `409`; missing records return `404`; change requests/rejections require a note. Each successful status change and its audit log are written in one database transaction. The endpoint is API groundwork and is not yet connected to the admin preview's local demo state.


## Admin UI live-mode smoke test

1. Start the app after configuring `DATABASE_URL`, applying the reviewed Prisma migration, and provisioning a super-admin or moderator account.
2. Open `/admin`, choose **Connect live data**, and sign in with that account.
3. Confirm that the listings table shows database records rather than the demo sample rows. Use search/status filters and **Refresh live data**.
4. Approve a pending listing, return a changes-requested listing to review, or request changes with a note. Verify the returned status and the corresponding `AuditLog` entry in the database.
5. Try an action that is invalid for the current status; the UI should display the API conflict message without silently changing the record.
6. Sign out and confirm the page explicitly returns to demo data.

This is a manual test plan, not a claim that a live database test has already been run.


## Blog CMS API smoke tests (v0.7.0)

After signing in to the local app with an account that has `posts:read` and `posts:write` permissions, the session cookie is required for these requests.

```bash
# List articles
curl -i -b cookies.txt 'http://localhost:3000/api/admin/posts?limit=30'

# Create a draft
curl -i -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"A Sample Hello Minto Guide","slug":"sample-hello-minto-guide","body":"Opening paragraph.\n\nSecond paragraph.","seoTitle":"A Sample Hello Minto Guide","metaDescription":"A short sample description for this guide.","status":"DRAFT"}' \
  http://localhost:3000/api/admin/posts

# Update an existing article (replace POST_ID)
curl -i -X PATCH -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"Updated Sample Guide","slug":"updated-sample-guide","body":"Updated article body.","seoTitle":"Updated Sample Guide","metaDescription":"Updated sample meta description.","status":"DRAFT"}' \
  http://localhost:3000/api/admin/posts/POST_ID
```

Verify that unauthorized requests return 401, roles without `posts:write` return 403, duplicate slugs return 409, published status requires `posts:publish`, and successful edits create a new `PostRevision` and `AuditLog` record. Test only against a development database first.
