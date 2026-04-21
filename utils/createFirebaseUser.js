const admin = require("firebase-admin");
const serviceAccount = require("./firebase_cred.json");

let createFirebaseUser;

if (admin.apps.length === 0) {
  createFirebaseUser = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  createFirebaseUser = admin.app();
}

module.exports = createFirebaseUser;