// Quick test endpoint to verify Firebase Admin is configured
const { getAdmin } = require('./_firebaseAdmin');

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  try {
    const admin = getAdmin();
    const projectId = (admin.app().options && admin.app().options.projectId) || process.env.FIREBASE_PROJECT_ID || 'unknown';
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
    const bucket = admin.storage().bucket(bucketName);
    // Touch the bucket metadata to ensure access
    await bucket.getMetadata().catch(()=>{});

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'ok',
        message: 'Firebase Admin is configured',
        projectId,
        bucket: bucketName,
        hasAuth: !!admin.auth,
        hasStorage: !!admin.storage
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: err.message || String(err),
        hint: 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and (optional) FIREBASE_STORAGE_BUCKET in Netlify environment variables.'
      })
    };
  }
};
