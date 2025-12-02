const admin = require('./_firebaseAdmin');

exports.handler = async (event) => {
  try{
    if(event.httpMethod === 'OPTIONS'){
      return { statusCode: 204, headers: corsHeaders() };
    }
    if(event.httpMethod !== 'POST'){
      return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' };
    }
    const { uid, email, fields } = JSON.parse(event.body||'{}');
    if(!uid || !email){
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error:'uid and email required' }) };
    }
    const db = admin.firestore();
    const ref = db.collection('users').doc(uid);
    await ref.set({ email, ...(fields||{}) }, { merge: true });
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok:true }) };
  }catch(err){
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message||String(err) }) };
  }
};

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
// Ensure users/{uid} doc exists using Firebase Admin (bypass client-side rules)
const { getAdmin } = require('./_firebaseAdmin');

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST'){
      return { statusCode: 405, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error:'method_not_allowed' }) };
    }
    const authz = event.headers && (event.headers.authorization || event.headers.Authorization);
    if(!authz || !authz.startsWith('Bearer ')){
      return { statusCode: 401, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error:'missing_auth' }) };
    }
    const idToken = authz.slice('Bearer '.length);
    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid; const email = decoded.email || '';
    const db = admin.firestore();
    await db.collection('users').doc(uid).set({ email, status:'active', createdAt: new Date().toISOString() }, { merge:true });
    return { statusCode: 200, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ ok:true }) };
  }catch(err){
    console.error('ensure-user-doc error', err);
    const code = err && err.code === 'auth/argument-error' ? 401 : 500;
    return { statusCode: code, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
