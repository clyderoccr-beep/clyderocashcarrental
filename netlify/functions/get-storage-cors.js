const { getAdmin } = require('./_firebaseAdmin');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if(event.httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Method Not Allowed' };
  try{
    const admin = getAdmin();
    let bucketName = process.env.FIREBASE_STORAGE_BUCKET || '';
    let tried = [];
    let errLast = null;
    async function attempt(name){
      const b = admin.storage().bucket(name);
      const [metadata] = await b.getMetadata();
      return { name, cors: metadata.cors || [] };
    }
    // Candidates: env as-is, mapped to appspot.com, and default bucket
    const candidates = [];
    if(bucketName) candidates.push(bucketName);
    if(bucketName && /\.firebasestorage\.app$/i.test(bucketName)){
      candidates.push(bucketName.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
    }
    // Default bucket from Admin options
    try{ const def = admin.app().options && admin.app().options.storageBucket; if(def) candidates.push(def); }catch{}
    // Unique
    const uniq = [...new Set(candidates.filter(Boolean))];
    for(const c of uniq){
      tried.push(c);
      try{ const res = await attempt(c); return { statusCode: 200, headers, body: JSON.stringify({ ok:true, bucket: res.name, cors: res.cors }) }; }catch(e){ errLast = e; }
    }
    // Try no-arg default bucket accessor
    try{
      const b = admin.storage().bucket();
      const [metadata] = await b.getMetadata();
      return { statusCode: 200, headers, body: JSON.stringify({ ok:true, bucket: b.name, cors: metadata.cors || [] }) };
    }catch(e){ errLast = e; }
    return { statusCode: 500, headers, body: JSON.stringify({ error:'bucket_not_found', tried, detail: errLast && (errLast.message||String(errLast)) }) };
  }catch(err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message||String(err), stack: (err && err.stack)||'' }) };
  }
};
