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
    let bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if(!bucketName){ return { statusCode: 500, headers, body: JSON.stringify({ error:'missing_bucket' }) }; }
    if(/\.firebasestorage\.app$/i.test(bucketName)){
      bucketName = bucketName.replace(/\.firebasestorage\.app$/i, '.appspot.com');
    }
    const admin = getAdmin();
    const bucket = admin.storage().bucket(bucketName);
    const [metadata] = await bucket.getMetadata();
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, bucket: bucketName, cors: metadata.cors || [] }) };
  }catch(err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message||String(err), stack: (err && err.stack)||'' }) };
  }
};
