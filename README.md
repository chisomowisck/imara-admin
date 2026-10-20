# Imara Platform Admin Console

Internal console for SmartTech staff to run the Imara platform: client organisations, plans and billing, payments, notifications, global configuration, support and system health. It is a separate app with its own sign-in. It never shares sessions with the tenant website and cannot change data inside a tenant.

| App | Folder | Stack | Default URL |
|---|---|---|---|
| API | `imara-backend` | NestJS, Prisma, PostgreSQL | http://localhost:3001/api/v1 (Swagger at `/swagger`) |
| Tenant website | `imara-website` | Next.js | http://localhost:3000 |
| Admin console | `imara-admin` | Vite, React, TypeScript, Tailwind | http://localhost:5173 |

## 1. Setup

Requirements: Node 20+, PostgreSQL 14+, and SMTP or Resend credentials if you want real emails. In development, codes and emails are written to the API log.

### Backend

```bash
cd imara-backend
npm install
cp .env.example .env        # then fill in the values below
npx prisma migrate deploy   # applies all migrations (the admin ones are additive only)
npx prisma generate
npm run seed:all            # existing tenant permissions/roles (if not done before)
npm run seed:platform       # admin roles, first Super Admin, configuration defaults, modules and plans
npm run start:dev
```

`seed:platform` prints the first Super Admin's temporary password **once**. Set `SEED_SUPER_ADMIN_PASSWORD` beforehand if you want to choose it. The password must be changed at first sign-in. The seed is idempotent and never overwrites values you have changed in the console.

### Tenant website

```bash
cd imara-website
npm install
# .env: NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
npm run dev
```

### Admin console

```bash
cd imara-admin
npm install
cp .env.example .env.local
npm run dev
```

## 2. Environment variables

### Admin console (`imara-admin/.env.local`)

| Variable | Purpose | Example |
|---|---|---|
| `VITE_API_BASE_URL` | API base including `/api/v1` | `http://localhost:3001/api/v1` |
| `VITE_APP_ENV` | Label shown in the top bar (`local`, `staging`, `production`) | `local` |

The Google client id is not configured here; the console reads it from the API.

### Backend additions (`imara-backend/.env`, see `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_JWT_ACCESS_SECRET`, `ADMIN_JWT_REFRESH_SECRET` | yes | Admin token secrets. These must differ from the tenant `JWT_*` secrets. |
| `ADMIN_JWT_ACCESS_EXPIRES_IN` | no (15m) | Admin access token lifetime. Idle and absolute session timeouts are set in Configuration > Security. |
| `ADMIN_BASE_URL` | yes | Admin console URL, used in invitation and password-reset emails. |
| `CONFIG_ENCRYPTION_KEY` | yes | 64 hex characters. Encrypts integration secrets at rest with AES-256-GCM. |
| `PUBLIC_API_BASE_URL` | yes | Public URL of the API, used for gateway webhooks and return URLs. |
| `SCHEDULER_ENABLED` | no (true) | `false` stops the cron jobs. They can still be run manually. |
| `GOOGLE_CLIENT_ID` | no | Google Identity Services client id for the website. Leave empty to hide the Google buttons. |
| `GOOGLE_ADMIN_CLIENT_ID` | no | Separate Google client for the admin console. Falls back to `GOOGLE_CLIENT_ID`. |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | no | First Super Admin created by `seed:platform`. |
| `CORS_ORIGIN` | yes | Must include the admin console origin (`http://localhost:5173`). |

For Google sign-in, add `http://localhost:3000` and `http://localhost:5173`, plus your real domains, as **Authorised JavaScript origins** on the Google OAuth client.

Payment gateway, SMTP/Resend and other integration credentials are **not** environment variables. A Super Admin enters them in **Configuration > Integrations**, where they are stored encrypted and only ever shown masked.

## 3. Signing in

1. Enter email and password, then the 6-digit code. Email OTP is always on. Admins can also add an authenticator app and download recovery codes under **My account**.
2. **Sign in with Google** works only for an existing admin whose email matches. It never creates admins, and the one-time code is still required.
3. Admin tokens are rejected by tenant routes and tenant tokens are rejected by `/api/v1/admin/*`.

## 4. Running scheduled jobs manually

All jobs are idempotent. Each run gets a key per period, such as a day or an hour, so a second run in the same period does nothing. Times are Africa/Blantyre.

| Job | Schedule | What it does |
|---|---|---|
| `billing-run` | 01:00 daily | Generates invoices for subscriptions due today, ends trials and charges auto-renewals. |
| `invoice-overdue` | 02:00 daily | Marks unpaid invoices overdue and suspends manual payers N days after the due date (default 14). |
| `dunning` | hourly at :15 | Retries failed auto-renew payments on Day 1, 3 and 7, and suspends on Day 14. |
| `metering` | 03:00 daily | Takes usage snapshots for users, transactions and storage, and sends 80% and 100% limit warnings. |
| `retention-alerts` | 04:00 daily | Alerts Super Admins when an archived organisation's retention period ends. Deletion is never automatic. |

Scheduled notifications and banners are checked every minute.

**From the console:** open **System health > Scheduled jobs > Run now**. You need the `ops.manage` permission.

**From the command line:**

```bash
TOKEN=<admin access token>   # e.g. from the browser's sessionStorage "imara-admin-session"
curl -X POST http://localhost:3001/api/v1/admin/ops/jobs/billing-run/run -H "Authorization: Bearer $TOKEN"
curl http://localhost:3001/api/v1/admin/ops/jobs -H "Authorization: Bearer $TOKEN"        # last run of each job
```

Failed items appear under **System health > Failed jobs**, where they can be retried.

## 5. Payments while OneKhusa is unavailable

`OneKhusaGateway` implements the `PaymentGateway` interface but stays switched off until the API is available. Until then the **mock gateway** is used:

- Paying an invoice on the website opens a placeholder checkout page with **Approve** and **Decline** buttons.
- A phone number or saved method ending in `0000` always fails, which is handy for testing dunning.
- Mock results go through the same signed webhook path (`x-imara-signature`) as the real gateway, so invoices, receipts and reactivation behave exactly as they will in production.

To switch to OneKhusa, enter its credentials and webhook secret in **Configuration > Integrations** and set the provider to OneKhusa.

## 6. Tests

```bash
cd imara-backend
npx jest src/platform src/platform-admin src/billing src/modules/auth
```

These cover status transitions, entitlement and limit guards, invoice numbering and VAT, the dunning schedule, admin/tenant auth separation and Google sign-in rules.

## 7. Project layout (admin console)

```
src/
  api/          typed API clients (axios with token refresh)
  auth/         AuthContext, route and permission guards
  components/   UI primitives, DataTable (sort, filter, export), charts, layout
  pages/        dashboard, tenants, billing, reports, notifications, support, config, ops, admins, audit, account
```

Every page checks the admin's permissions both in the UI and in the API. The API is the source of truth.
