# Firebase Setup (Project: `mouse-ee60c`)

## 1) CLI
You can use either:
- `npm install -g firebase-tools`
- or `npx firebase-tools ...` (no global install)

## 2) Login and link project
```bash
firebase login
firebase use --add
```
Select project `mouse-ee60c`.

## 3) Environment configuration
Copy `.env.example` to `.env` and set:
- `VITE_FIREBASE_*` values (web app)
- `FIREBASE_*` values (admin SDK)
- one of:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_SERVICE_ACCOUNT_BASE64`
  - `FIREBASE_SERVICE_ACCOUNT_PATH`

## 4) Enable products in Firebase Console
- Authentication
- Cloud Firestore (Native mode)
- Realtime Database
- Cloud Storage

## 5) Validate app startup
```bash
npm run check
npm run dev
```

## Notes
- Firebase web `apiKey` is not a server secret, but still keep `.env` out of git.
- Never commit service account credentials.
