# Web Deployment (Firebase App Hosting)

This project is configured for Firebase **App Hosting** deployment flow.

## 1) Create/verify App Hosting backend
```bash
firebase apphosting:backends:list
firebase apphosting:backends:create
```

Use a backend ID you control, such as `mouse2-web` (lowercase + hyphens).

## 2) Set required secrets/env on App Hosting
Required runtime values:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_STORAGE_BUCKET`
- one service account option:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`, or
  - `FIREBASE_SERVICE_ACCOUNT_BASE64`, or
  - `FIREBASE_SERVICE_ACCOUNT_PATH`

## 3) Deploy
```bash
npm run deploy:apphosting
```

`deploy:web` is an alias to the same App Hosting deploy command.

This repository is intentionally not linked to a Firebase project. Run `firebase use --add` against your own project before deploying.

## 4) Operator access control
Protected backend endpoints require `x-session-token`.
Admin dashboard endpoint:
- `GET /api/cloud/admin-dashboard`

## 5) Cloud synchronization behavior
Operational writes sync to Firebase cloud datasets:
- missions, waypoints, drones, locations
- flight logs, sensor/motor telemetry
- media assets, flight sessions
- messages and operator actions

Media/video behavior:
- `/api/drive/upload` attempts Firebase Storage first.
- On cloud outage, data is staged in `data/media_staging` and marked `pending`.
- Background retry runs every 60 seconds.
- Manual retry endpoint: `POST /api/cloud/media/sync-pending`
