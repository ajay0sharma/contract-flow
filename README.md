# ContractFlow

Next.js contract workflow app with Clerk auth, Supabase Postgres + Storage, and Prisma.

## Local development

```bash
cp .env.example .env.local
# Fill in values, then:
npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

### 1. Push to GitHub

Create a repo and push this project (Vercel deploys from Git):

```bash
git add .
git commit -m "Prepare ContractFlow for Vercel deployment"
git remote add origin https://github.com/YOUR_USER/contract-app.git
git push -u origin main
```

### 2. Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `.` (default)
5. Build command: uses `vercel.json` → `prisma migrate deploy && npm run build`

### 3. Environment variables

In Vercel → **Project → Settings → Environment Variables**, add the variables from [`.env.example`](.env.example) for **Production** (and Preview if you want preview deploys to work).

Minimum required:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Use Supabase **connection pooler** (port **6543**, `?pgbouncer=true`) for serverless |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard |
| `CLERK_SECRET_KEY` | Clerk dashboard |
| `CLERK_TRUST_HOST` | `true` |
| `ADMIN_EMAILS` | Comma-separated admin emails |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://contract-app.vercel.app` |
| `CRON_SECRET` | Random secret; Vercel Cron sends `Authorization: Bearer <value>` |

Copy the rest from `.env.example` as needed (OpenAI, Sentry, etc.).

### 4. Clerk production URLs

In [Clerk Dashboard](https://dashboard.clerk.com) → your app → **Domains**:

- Add your Vercel domain (e.g. `contract-app.vercel.app`)
- Under **Paths**, ensure sign-in/sign-up paths match `/login` and `/sign-up`

### 5. Supabase

- **Database**: migrations run automatically on each Vercel build via `prisma migrate deploy`
- **Storage**: after first deploy, ensure buckets exist (one-time):

```bash
DATABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." npm run storage:ensure-templates-bucket
```

Buckets used: `contract-templates`, `contract-documents`, `organization-branding`.

### 6. Deploy

Vercel deploys on every push to `main`. Or deploy from CLI:

```bash
npx vercel login
npx vercel --prod
```

### Cron jobs

`vercel.json` schedules directory sync daily at 2:00 UTC (`/api/cron/directory-sync`). Requires `CRON_SECRET` in Vercel env vars.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Create/apply migrations locally |
| `npx prisma migrate deploy` | Apply migrations (also runs on Vercel build) |
| `npm run storage:ensure-templates-bucket` | Create Supabase storage buckets |
