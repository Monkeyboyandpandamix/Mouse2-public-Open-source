# Web Deployment (Operators)

This project now includes Firebase Hosting config for project `mouse-ee60c`.

## 1) Deploy backend API (required for control/telemetry routes)
Deploy the Express API to Cloud Run as service `mouse-api` in `us-central1`.

Example (from your backend deploy pipeline):
```bash
gcloud run deploy mouse-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

Set backend environment variables on Cloud Run:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_STORAGE_BUCKET`
- one of service account options (`FIREBASE_SERVICE_ACCOUNT_JSON` / `..._BASE64` / `..._PATH`)
- existing app env vars used by this project.

## 2) Deploy web app to Firebase Hosting
```bash
npm run deploy:web
```

This deploys `dist/public` and uses Hosting rewrites:
- `/api/**` -> Cloud Run service `mouse-api`
- `/**` -> `index.html` (SPA)

## 3) Operator access control
The backend requires session credentials for protected cloud endpoints:
- send `x-session-token` header
- admin-only dashboard: `/api/cloud/admin-dashboard`

## 4) Cloud synchronization
Operational writes are mirrored to Firebase cloud collections and realtime channels:
- missions, waypoints, drones, locations
- flight logs, sensor/motor telemetry
- media assets, flight sessions
- messages (DM-aware visibility), operator actions

Media/video behavior:
- `/api/drive/upload` now attempts Firebase Storage first.
- If cloud is unavailable, media is staged locally in `data/media_staging` and marked `pending`.
- Background retry runs automatically every 60 seconds (`offline_backlog` -> cloud).
- Manual retry endpoint: `POST /api/cloud/media/sync-pending`

Voice bridge behavior (web operators):
- Authenticated operator session endpoints:
  - `GET /api/audio/session`
  - `POST /api/audio/session/join`
  - `POST /api/audio/session/leave`
- Existing audio control APIs remain available for drone mic/speaker control.
