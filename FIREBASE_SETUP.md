# Firebase Setup

## 1) CLI
You can use either:
- `npm install -g firebase-tools`
- or `npx firebase-tools ...` (no global install)

## 2) Create your own Firebase project
1. Open [Firebase Console](https://console.firebase.google.com/).
2. Create a new project for your own Mouse2 deployment.
3. Enable:
   - Authentication
   - Cloud Firestore
   - Realtime Database
   - Cloud Storage

## 3) Login and link project
```bash
firebase login
firebase use --add
```
Select the Firebase project you created.

## 4) Create a Firebase web app
In Firebase Console, add a Web app and copy these values into `.env`:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` if Analytics is enabled

## 5) Create an Admin SDK key
In Firebase Console:
1. Open `Project settings`.
2. Open `Service accounts`.
3. Click `Generate new private key`.
4. Store that JSON file outside this repository.

## 6) Environment configuration
Copy `.env.example` to `.env` and set:
- `VITE_FIREBASE_*` values (web app)
- `FIREBASE_*` values (admin SDK)
- one of:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_SERVICE_ACCOUNT_BASE64`
  - `FIREBASE_SERVICE_ACCOUNT_PATH`

## 7) Validate app startup
```bash
npm run check
npm run dev
```

## Notes
- Firebase web `apiKey` is not a server secret, but still keep `.env` out of git.
- Never commit service account credentials.
- This repo does not include a Firebase project binding or service-account file.
