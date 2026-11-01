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

## Registering Your Telegram Bot Webhook
Once your Cloud Run service is deployed for the first time, register its URL with Telegram, passing the same secret as `secret_token`:

```sh
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<YOUR_CLOUD_RUN_URL>/api/webhook/telegram", "secret_token": "<YOUR_WEBHOOK_SECRET>"}'
```

After that, no manual re-registration is needed when the secret changes: on Cloud Run (where `K_SERVICE` is set), when both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are set, the server calls `getWebhookInfo` on startup and, if a webhook URL is registered, calls `setWebhook` again with the same URL, the same `allowed_updates` and the configured secret. Neither the bot token nor the secret is logged.

Outside Cloud Run (`K_SERVICE` unset, e.g. a local server) this startup re-registration is skipped and logged, so a local server never re-points the webhook. Every Cloud Run service configured with the same bot token must still use the same `TELEGRAM_WEBHOOK_SECRET`: a second service with a different secret would re-register the webhook with its own secret on start.
