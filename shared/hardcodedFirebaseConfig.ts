// Temporary hardcoded Firebase configuration for private/internal use.
// To remove later: delete this file and switch callers to env/runtime config only.

export const HARDCODED_FIREBASE_PROJECT = {
  projectId: "mouse-ee60c",
  projectNumber: "1059220263576",
  databaseURL: "https://mouse-ee60c-default-rtdb.firebaseio.com",
  storageBucket: "mouse-ee60c.firebasestorage.app",
  authDomain: "mouse-ee60c.firebaseapp.com",
  messagingSenderId: "1059220263576",
  serviceAccountPath:
    "/Users/mohammadaghamohammadi/Desktop/mouse-ee60c-firebase-adminsdk-fbsvc-7a37337fa6.json",
} as const;

export const HARDCODED_FIREBASE_WEB_APPS = {
  primary: {
    apiKey: "AIzaSyC0AJEC6KN7pyUq49vtNLVYM4t46PFGvlI",
    authDomain: "mouse-ee60c.firebaseapp.com",
    databaseURL: "https://mouse-ee60c-default-rtdb.firebaseio.com",
    projectId: "mouse-ee60c",
    storageBucket: "mouse-ee60c.firebasestorage.app",
    messagingSenderId: "1059220263576",
    appId: "1:1059220263576:web:384be6c35332ba3df9f6ed",
    measurementId: "G-FHK3JHJKGR",
  },
  secondary: {
    apiKey: "AIzaSyC0AJEC6KN7pyUq49vtNLVYM4t46PFGvlI",
    authDomain: "mouse-ee60c.firebaseapp.com",
    databaseURL: "https://mouse-ee60c-default-rtdb.firebaseio.com",
    projectId: "mouse-ee60c",
    storageBucket: "mouse-ee60c.firebasestorage.app",
    messagingSenderId: "1059220263576",
    appId: "1:1059220263576:web:25202827c2f83c4ef9f6ed",
    measurementId: "G-8RWZBYGYGB",
  },
} as const;

