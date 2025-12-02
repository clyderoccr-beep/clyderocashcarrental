const { getAdmin } = require('./_firebaseAdmin');

// Expects env STORAGE_CORS_SECRET for simple auth, and FIREBASE_STORAGE_BUCKET
// Optional STORAGE_ALLOWED_ORIGINS comma-separated (default https://clyderoccr.com)
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if(event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const secret = process.env.STORAGE_CORS_SECRET;
    const headersIn = event.headers || {};
    const bearerRaw = headersIn.authorization || headersIn.Authorization || '';
    const providedHeader = bearerRaw.replace(/^Bearer\s+/i,'').trim();
    const qsToken = (event.queryStringParameters && (event.queryStringParameters.token||'')) || '';
    const provided = providedHeader || qsToken;
    if(!secret || !provided || provided !== secret){
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
    }
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if(!bucketName){
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'missing_bucket' }) };
    }
    // Use Firebase Admin's configured credentials to access Storage
    const admin = getAdmin();
    const bucket = admin.storage().bucket(bucketName);
    const originsEnv = process.env.STORAGE_ALLOWED_ORIGINS || 'https://clyderoccr.com';
    const origins = originsEnv.split(',').map(o=>o.trim()).filter(Boolean);
    const corsConfig = [
      {
        origin: origins,
        method: ['GET','HEAD','PUT','POST','DELETE'],
        responseHeader: [
          'Content-Type','Authorization','X-Goog-Algorithm','X-Goog-Credential','X-Goog-Date','X-Goog-Expires','X-Goog-SignedHeaders','X-Goog-Signature','Range'
        ],
        maxAgeSeconds: 3600
      }
    ];
    await bucket.setCors(corsConfig);
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, applied: corsConfig }) };
  } catch (err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message||String(err) }) };
  }
};
