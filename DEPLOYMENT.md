# Marginalia deployment

The hosted topology is:

```text
Vercel (apps/web) -> Cloud Run (apps/api) -> private Supabase Storage
```

Supabase is server-only. The browser and Vercel do not need a Supabase key.

## 1. Supabase

Project: `marginalia`
Project ref: `srdwuagoecrcahjhwsco`
Project URL: `https://srdwuagoecrcahjhwsco.supabase.co`

The secret key previously pasted into chat should be treated as exposed. Rotate it in
**Project Settings -> API Keys**, create a dedicated secret named `marginalia-cloud-run`,
and use the replacement only in Google Secret Manager. Do not commit it or add it to
Vercel. The publishable key is intentionally unused.

Apply [the storage migration](supabase/migrations/20260722000000_create_marginalia_papers_bucket.sql)
from the Supabase SQL Editor, or run:

```bash
npx supabase login
npx supabase link --project-ref srdwuagoecrcahjhwsco
npx supabase db push --dry-run
npx supabase db push
```

If you use the SQL Editor, paste and run the migration file once. It is idempotent, so it
is safe to run again. Then verify the bucket with:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'marginalia-papers';
```

The result must show `public = false`, `file_size_limit = 31457280`, and the three MIME
types `application/pdf`, `application/json`, and `image/png`. No table migration and no
Storage RLS policy is needed: Cloud Run uses a backend `sb_secret_...` key, which has the
`service_role` and bypasses RLS. Do not create an anonymous read policy.

The migration creates a private `marginalia-papers` bucket with a 30 MiB per-object limit
and permits only PDF, JSON, and PNG objects. Do not add public read policies. Cloud Run uses
the backend secret key and serves artifacts through the existing `/blob/...` API.

Stored keys retain the content-hash contract:

```text
<sha256>/paper.pdf
<sha256>/manifest.json
<sha256>/crops/*.png
```

## 2. Google Cloud Run

Configure the connected repository build with `apps/api` as the build context/source
directory and `Dockerfile` as the Dockerfile path relative to that directory. Do not use
the repository root as the Docker build context: this Dockerfile intentionally copies
`pyproject.toml` and `uv.lock` from `apps/api`. It listens on Cloud Run's injected `PORT`
using `0.0.0.0`.

Recommended service settings:

- service name: `marginalia-api`
- CPU: 2; memory: 2 GiB
- concurrency: 1 (PDF extraction is CPU- and memory-heavy)
- request timeout: 900 seconds
- minimum instances: 0; maximum instances: 2 initially (cost/abuse guardrail)
- health path: `/api/health`
- allow unauthenticated invocations (the browser loads PDFs and crops from this API)

Set these normal environment variables:

```text
MARGINALIA_STORAGE_BACKEND=supabase
MARGINALIA_MAX_PDF_BYTES=31457280
SUPABASE_URL=https://srdwuagoecrcahjhwsco.supabase.co
SUPABASE_STORAGE_BUCKET=marginalia-papers
CORS_ALLOW_ORIGINS=https://YOUR_PRODUCTION_DOMAIN
```

For preview deployments, set `CORS_ALLOW_ORIGIN_REGEX` to a narrowly scoped expression for
your Vercel team/project. Avoid a blanket `https://.*` rule.

In Google Secret Manager, create a secret such as `marginalia-supabase-secret-key` containing
the rotated Supabase backend key. Prefer a new Supabase key named `marginalia-cloud-run`
whose value starts with `sb_secret_`. Map a pinned Secret Manager version to the Cloud Run
environment variable `SUPABASE_SECRET_KEY`. Grant the Cloud Run service account
**Secret Manager Secret Accessor** for that secret. Never enter the key as a plain Cloud Run
environment variable.

After deployment, verify:

```bash
curl https://YOUR_CLOUD_RUN_URL/api/health
```

The response should be `{"status":"ok","storage":"supabase"}`.

## 3. Vercel

For the already-connected project, open **Project Settings -> Build and Deployment** and set:

```text
Framework Preset: Next.js
Root Directory: apps/web
Include source files outside of the Root Directory: Enabled
Build Command: (leave default: npm run build)
Install Command: (leave default: npm install/npm ci auto-detection)
Output Directory: (leave default)
Node.js Version: 20.x or newer
```

Do not set the root to `/`, `apps`, or the repository name. The exact Root Directory value
is `apps/web`. The outside-source toggle is required because `apps/web/lib/manifest.ts`
imports the generated contract from `packages/schema/manifest.ts`.

Add this variable in **Project Settings -> Environment Variables**:

```text
NEXT_PUBLIC_API_BASE=https://YOUR_CLOUD_RUN_URL
```

Set it for Production. Set it for Preview too only if Cloud Run's CORS regex allows your
preview hosts. Do not include a trailing slash. `NEXT_PUBLIC_` values are compiled into the
browser bundle, so redeploy after changing it. Do not add `SUPABASE_URL`, a publishable key,
or a secret key to Vercel. The home page uploads PDFs directly to Cloud Run, avoiding
Vercel Functions' request-body limit.

Unless a hosted generation provider is configured, also set:

```text
MARGINALIA_AI_PROVIDER=disabled
```

Finally, add the exact Vercel production URL to Cloud Run's `CORS_ALLOW_ORIGINS` and deploy a
new Cloud Run revision.

### Hosted visual generation status

The real visualization/game pipeline remains in the application: it builds bounded
`SourceEvidence`, calls the provider-neutral server routes, validates schemas and source
IDs, and renders only validated results. The hardcoded chain-of-thought demo and its
paper-specific bypass have been removed.

The only implemented generation adapter is currently Ollama. `MARGINALIA_AI_PROVIDER=disabled`
is therefore the correct Vercel production setting unless you deploy a reachable Ollama
service and deliberately configure its private URL. A Vercel function cannot reach Ollama
running on your laptop. With the provider disabled, deterministic source-grounded activities
and visual fallbacks still work, but model-generated visuals/games do not. A hosted-provider
adapter is a separate feature; do not put an arbitrary vendor key into Vercel until that
adapter exists.

## 4. Deployment order and smoke test

1. Run the Supabase migration and verify the private bucket.
2. Rotate/create the dedicated Supabase secret key and put it in Google Secret Manager.
3. Deploy Cloud Run with the variables and secret mapping above.
4. Confirm `GET https://YOUR_CLOUD_RUN_URL/api/health` returns Supabase storage.
5. Set Vercel Root Directory and `NEXT_PUBLIC_API_BASE`, then redeploy Vercel.
6. Put the resulting Vercel production origin in Cloud Run `CORS_ALLOW_ORIGINS` and deploy
   one final Cloud Run revision.
7. From the Vercel site, ingest an arXiv ID, upload a small PDF, open one crop, and reload
   the same paper to confirm the Supabase cache hit survives Cloud Run instance replacement.

The service is intentionally public and has no accounts or authentication. The upload-size
limit and low Cloud Run maximum-instance count are only cost guardrails, not abuse prevention.

## Local environment

Copy the relevant `.env.example` file without committing the result. Filesystem storage
remains the safe local default. To exercise Supabase locally, change
`MARGINALIA_STORAGE_BACKEND` to `supabase`, add the rotated secret, and start Uvicorn with
that env file.
