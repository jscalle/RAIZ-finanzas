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
  --set-env-vars GOOGLE_CLOUD_PROJECT="YOUR_GCP_PROJECT_ID",VITE_FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID",TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN",WEBHOOK_SECRET_TOKEN="YOUR_TOKEN"
```

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
  --update-env-vars TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN",WEBHOOK_SECRET_TOKEN="YOUR_TOKEN"
```

## Registering Your Telegram Bot Webhook
Once your Cloud Run service is deployed, register its URL with Telegram:

```sh
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<YOUR_CLOUD_RUN_URL>/api/webhook/telegram"}'
```
