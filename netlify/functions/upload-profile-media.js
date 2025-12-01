// Upload profile avatar/cover via server to avoid client CORS/App Check issues
const { getAdmin } = require('./_firebaseAdmin');

exports.handler = async (event) => {
  try{
    // Handle CORS preflight
    const baseHeaders = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
    if(event.httpMethod === 'OPTIONS'){
      return { statusCode: 204, headers: baseHeaders, body: '' };
    }
    if(event.httpMethod !== 'POST'){
      return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error:'method_not_allowed' }) };
    }
    const authz = event.headers && (event.headers.authorization || event.headers.Authorization);
    if(!authz || !authz.startsWith('Bearer ')){
      return { statusCode: 401, headers: baseHeaders, body: JSON.stringify({ error:'missing_auth' }) };
    }
    const idToken = authz.slice('Bearer '.length);
    let admin;
    try{ admin = getAdmin(); }
    catch(e){
      console.error('Admin init error', e);
      return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error:'admin_init_failed', detail: e.message||String(e) }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = JSON.parse(event.body||'{}');
    const kind = body.kind === 'cover' ? 'cover' : 'avatar';
    const dataUrl = body.dataUrl || '';
    const contentType = (dataUrl.match(/^data:(.*?);base64,/)||[])[1] || 'image/jpeg';
    const base64 = dataUrl.replace(/^data:.*;base64,/, '');
    if(!base64){
      return { statusCode: 400, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ error:'invalid_body' }) };
    }
    const buffer = Buffer.from(base64, 'base64');

    const bucket = admin.storage().bucket();
    const ts = Date.now();
    const dir = kind === 'cover' ? 'profile_covers' : 'profile_photos';
    const path = `${dir}/${uid}/${ts}.jpg`;
    const { randomUUID } = require('crypto');
    const token = randomUUID();
    const file = bucket.file(path);
    await file.save(buffer, {
      contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } }
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url, path }) };
  }catch(err){
    console.error('upload-profile-media error', err);
    const code = err && (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') ? 401 : 500;
    return { statusCode: code, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS' }, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
