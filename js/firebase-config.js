// Shared across every family game — one Firebase project, one collection each.
// This is a client config, not a secret: it ships in every page load, the key
// is restricted to the Cloud Firestore API and referrer-restricted to the
// games' own origin, and the rules require an anonymous sign-in.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyD1h2aN_9spXt8usZ_ycpGFnIIGztESXWk",
  authDomain: "wordvoyage-e5a5c.firebaseapp.com",
  projectId: "wordvoyage-e5a5c",
  storageBucket: "wordvoyage-e5a5c.firebasestorage.app",
  messagingSenderId: "569011992319",
  appId: "1:569011992319:web:bdcd6019d112006b5cbeca",
};
