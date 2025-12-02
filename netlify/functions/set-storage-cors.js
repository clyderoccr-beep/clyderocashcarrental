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
    const admin = getAdmin();
    // Build candidate bucket names as in get-storage-cors
    let bucketName = process.env.FIREBASE_STORAGE_BUCKET || '';
    const candidates = [];
    if(bucketName) candidates.push(bucketName);
    if(bucketName && /\.firebasestorage\.app$/i.test(bucketName)){
      candidates.push(bucketName.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
    }
    try{ const def = admin.app().options && admin.app().options.storageBucket; if(def) candidates.push(def); }catch{}
    candidates.push(''); // allow default
    let bucket = null; let picked=''; let lastErr=null;
    for(const c of [...new Set(candidates)]){
      try{ const b = c ? admin.storage().bucket(c) : admin.storage().bucket(); const [m] = await b.getMetadata(); bucket=b; picked=b.name; break; }catch(e){ lastErr=e; }
    }
    if(!bucket){ return { statusCode: 500, headers, body: JSON.stringify({ error:'bucket_not_found', detail: lastErr && (lastErr.message||String(lastErr)) }) }; }
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
    await bucket.setMetadata({ cors: corsConfig });
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, bucket: picked, applied: corsConfig }) };
  } catch (err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message||String(err), stack: (err && err.stack) || '' }) };
  }
};
