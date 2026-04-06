# Mouse2 Open-Source Setup

This public repository does not include a Firebase project, App Hosting backend, service-account JSON, or local runtime state. To enable cloud features, create and connect your own Firebase resources.

## Quick start
1. Copy `.env.example` to `.env`.
2. Create your own Firebase project in [Firebase Console](https://console.firebase.google.com/).
3. Add a Firebase Web app and copy its SDK values into `VITE_FIREBASE_*`.
4. Generate an Admin SDK private key and configure one of:
   - `FIREBASE_SERVICE_ACCOUNT_PATH`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_SERVICE_ACCOUNT_BASE64`
5. Fill in `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, and `FIREBASE_STORAGE_BUCKET`.
6. Run `npm run check` and `npm run dev`.

## Firebase web app values
Open `Project settings` in Firebase Console, then under `Your apps` create or open a Web app. Copy:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` if Analytics is enabled

## Firebase Admin SDK key
Open `Project settings` -> `Service accounts` -> `Generate new private key`.

Recommended local setup:
```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/your-service-account.json
```

Alternatives:
```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_SERVICE_ACCOUNT_BASE64=base64-encoded-json
```

## Required Firebase products
- Authentication
- Cloud Firestore
- Realtime Database
- Cloud Storage

## App Hosting
1. Run `firebase login`.
2. Run `firebase use --add` and select your own project.
3. Create an App Hosting backend with your own backend ID.
4. Set the same `FIREBASE_*` runtime variables in App Hosting.

## Security notes
- Do not commit `.env`.
- Do not commit service-account JSON files.
- The `data/` directory is generated at runtime and should stay local.
