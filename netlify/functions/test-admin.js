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
    const projectId = admin.app().options.projectId || 'unknown';
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'ok',
        message: 'Firebase Admin is configured',
        projectId,
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
        hint: 'Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables'
      })
    };
  }
};
