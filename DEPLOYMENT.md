# Deployment Instructions — RAÍZ Finanzas

## Overview
This document explains the steps to deploy the **RAÍZ Finanzas** backend to Google Cloud Run and the frontend to Firebase Hosting.

## Prerequisites
- Google Cloud CLI (`gcloud`) installed and authenticated.
- Firebase CLI (`firebase`) installed and authenticated.

## Deployment Steps

### 1. Build and Deploy Backend to Google Cloud Run
Run the following command to deploy the backend API to Cloud Run. Make sure your environment variables are configured.

```sh
gcloud run deploy raiz-finanzas-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT="YOUR_GCP_PROJECT_ID",VITE_FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID",TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN",TELEGRAM_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
```

`GOOGLE_CLOUD_PROJECT` is required: the server reads the Firebase project id from it (then `FIREBASE_PROJECT_ID`, then `VITE_FIREBASE_PROJECT_ID`). If none is set, or the value is a placeholder (`your-firebase-project-id` or anything starting with `your-`), the server logs one `[config]` error at startup, does not initialize Firebase Admin, and the Firebase-backed endpoints answer 503.

`TELEGRAM_WEBHOOK_SECRET` is required when the Telegram bot is used: every update to `/api/webhook/telegram` without a matching `X-Telegram-Bot-Api-Secret-Token` header is rejected with 401 (and all updates are rejected while it is unset). Generate one with `openssl rand -hex 32` (Telegram allows 1-256 characters: `A-Z`, `a-z`, `0-9`, `_`, `-`).

### 2. Deploy Frontend & Security Rules to Firebase
Build the frontend with your `.env` configured and deploy Hosting + Firestore rules:

```sh
npm run build
firebase deploy --only hosting,firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

## Environment Variables Configuration
To update environment variables on Cloud Run:

```sh
gcloud run services update raiz-finanzas-api \
  --region us-central1 \
  --update-env-vars TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN",TELEGRAM_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
```

The SMS / iOS Shortcuts webhook (`/api/webhook/transacciones`) was removed, so `WEBHOOK_SECRET_TOKEN` and `DEFAULT_SPACE_ID` are no longer read. Remove them from an existing service:

```sh
gcloud run services update raiz-finanzas-api \
  --region us-central1 \
  --remove-env-vars WEBHOOK_SECRET_TOKEN,DEFAULT_SPACE_ID
```

### CORS for a frontend on another origin
The browser blocks a call that carries an `Authorization` header to another origin unless the API answers the preflight with `Access-Control-Allow-Origin`. When the frontend is served from Firebase Hosting and the API from Cloud Run (the layout this guide uses), set `CORS_ALLOWED_ORIGINS` on the Cloud Run service to the exact origins of the frontend, comma separated:

```sh
gcloud run services update raiz-finanzas-api \
  --region us-central1 \
  --update-env-vars "^@^CORS_ALLOWED_ORIGINS=https://app.example.com,https://your-project-id.web.app"
```

Only exact origins are accepted (scheme and host, optional port): no `*`, no paths. Entries that do not match are ignored with a `[cors]` warning at startup. Credentials are never allowed because the API uses bearer tokens. With the variable empty or unset, nothing changes.

## QA environment

QA is a separate Firebase/GCP project: its own Firestore, rules, Cloud Run service, Hosting site and Gemini key. Nothing is shared with production, so you can test new behaviour (including Firestore rule changes) without touching what real users run. QA never gets the Telegram variables: without `TELEGRAM_BOT_TOKEN` the startup webhook sync is skipped, so QA cannot move or re-register the production bot's webhook.

`scripts/qa/deploy-qa.sh` deploys it. It refuses a project or service name that does not contain a `qa`, `dev`, `test` or `staging` token, so a mistyped project id cannot reach production. Add `--dry-run` to any command to print what it would run.

### One-time setup (you run these; replace `<QA_PROJECT_ID>`, for example `raiz-qa`)

1. Create a Firebase project named with a `qa` token. Link a billing account (Cloud Run needs it; the free tier covers light testing) and set a budget alert.
2. In the Firebase console: enable Authentication with the Google provider, create a Firestore database (Native mode), and register a Web app to get its config values.
3. Enable the APIs:
   ```sh
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project <QA_PROJECT_ID>
   ```
4. Create a **new** Gemini API key in AI Studio just for QA (never reuse the production key) and store it as a secret without printing it:
   ```sh
   read -rs QA_GEMINI_KEY && printf '%s' "$QA_GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=- --project <QA_PROJECT_ID>; unset QA_GEMINI_KEY
   gcloud secrets add-iam-policy-binding gemini-api-key --project <QA_PROJECT_ID> \
     --member "serviceAccount:$(gcloud projects describe <QA_PROJECT_ID> --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
     --role roles/secretmanager.secretAccessor
   ```
5. Create `.env.qa` at the repo root (git ignores it) with the QA web app config. Copy the values from the Firebase console (the storage bucket suffix differs between older and newer projects). Vite also loads `.env`, so the script requires **every** `VITE_*` variable the app reads to be defined here, and refuses a file with gaps, so a QA build cannot inherit production values. The two optional ones may be empty (analytics off, and no OAuth client id), but they must be present:
   ```sh
   VITE_FIREBASE_PROJECT_ID="<QA_PROJECT_ID>"
   VITE_FIREBASE_API_KEY="..."
   VITE_FIREBASE_AUTH_DOMAIN="<QA_PROJECT_ID>.firebaseapp.com"
   VITE_FIREBASE_STORAGE_BUCKET="..."
   VITE_FIREBASE_MESSAGING_SENDER_ID="..."
   VITE_FIREBASE_APP_ID="..."
   VITE_API_BASE_URL="<set after the first api deploy>"
   VITE_FIREBASE_MEASUREMENT_ID=""
   VITE_GOOGLE_OAUTH_CLIENT_ID=""
   ```
   The script needs `gcloud`, the Firebase CLI and `pnpm` (the production steps above use `npm`, which also works for the build).

### Deploy

```sh
export QA_PROJECT_ID=<QA_PROJECT_ID>
scripts/qa/deploy-qa.sh rules            # Firestore rules
scripts/qa/deploy-qa.sh api              # Cloud Run, max 2 instances, CORS for https://<QA_PROJECT_ID>.web.app
# put the printed Cloud Run URL in .env.qa as VITE_API_BASE_URL, then:
scripts/qa/deploy-qa.sh check            # validates names, tools and .env.qa
scripts/qa/deploy-qa.sh web              # builds with --mode qa and deploys Hosting
```

`api` also reads the deployed service back and fails if it carries Telegram variables or if it cannot read it, and `web` refuses to deploy a bundle that does not mention the QA project id. Open `https://<QA_PROJECT_ID>.web.app`, sign in with Google and create a test space. Use fictitious data only. If the Google consent screen is in Testing mode, add your testers there.

### Clean-up

Delete the QA project in the console, or only the service: `gcloud run services delete finpersonal-api-qa --project <QA_PROJECT_ID> --region us-central1`.

## Registering Your Telegram Bot Webhook
Once your Cloud Run service is deployed for the first time, register its URL with Telegram, passing the same secret as `secret_token`:

```sh
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<YOUR_CLOUD_RUN_URL>/api/webhook/telegram", "secret_token": "<YOUR_WEBHOOK_SECRET>"}'
```

After that, no manual re-registration is needed when the secret changes: on Cloud Run (where `K_SERVICE` is set), when both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are set, the server calls `getWebhookInfo` on startup and, if a webhook URL is registered, calls `setWebhook` again with the same URL, the same `allowed_updates` and the configured secret. Neither the bot token nor the secret is logged.

Outside Cloud Run (`K_SERVICE` unset, e.g. a local server) this startup re-registration is skipped and logged, so a local server never re-points the webhook. Every Cloud Run service configured with the same bot token must still use the same `TELEGRAM_WEBHOOK_SECRET`: a second service with a different secret would re-register the webhook with its own secret on start.
