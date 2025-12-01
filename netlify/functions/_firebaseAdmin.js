// Centralized Firebase Admin initialization for Netlify Functions
// Supports either a full JSON service account in FIREBASE_SERVICE_ACCOUNT_JSON
// or discrete env vars FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// Falls back to project id from FIREBASE_CONFIG if present.

const admin = require('firebase-admin');

let initialized = false;

function getProjectId() {
  try {
    if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
    if (process.env.FIREBASE_CONFIG) {
      const cfg = JSON.parse(process.env.FIREBASE_CONFIG);
      if (cfg.projectId) return cfg.projectId;
    }
  } catch {}
  return undefined;
}

function initAdmin() {
  if (initialized) return admin;
  if (admin.apps && admin.apps.length) { initialized = true; return admin; }

  const projectId = getProjectId();

  // Option 1: Full service account JSON in a single env var
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      const sa = JSON.parse(saJson);
      admin.initializeApp({ credential: admin.credential.cert(sa), projectId });
      initialized = true;
      return admin;
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }

  // Option 2: Discrete vars
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    // Handle escaped newlines from UI env var inputs
    privateKey = privateKey.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      projectId
    });
    initialized = true;
    return admin;
  }

  // Option 3: No credentials provided — try projectId only (may fail without ADC)
  if (projectId) {
    admin.initializeApp({ projectId });
    initialized = true;
    return admin;
  }

  throw new Error('Firebase Admin not configured: set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID.');
}

module.exports = { getAdmin: initAdmin };
