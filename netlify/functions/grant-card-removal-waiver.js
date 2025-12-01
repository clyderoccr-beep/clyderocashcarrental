const admin = require('firebase-admin');
function ensureAdmin(){ if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); } }

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };
  try{
    ensureAdmin();
    const db = admin.firestore();
    const body = JSON.parse(event.body||'{}');
    const targetEmail = (body.targetEmail||'').trim();
    const adminEmail = (body.adminEmail||'').trim();
    const OWNER = (process.env.ADMIN_OWNER_EMAIL||'clyderofraser97@gmail.com').toLowerCase();
    if(!targetEmail) return { statusCode:400, body:'Missing targetEmail' };
    if(!adminEmail) return { statusCode:400, body:'Missing adminEmail' };
    if(adminEmail.toLowerCase() !== OWNER){ return { statusCode:403, body:'Not authorized' }; }
    const uq = await db.collection('users').where('email','==',targetEmail).limit(1).get();
    if(uq.empty) return { statusCode:404, body:'User not found' };
    const ref = uq.docs[0].ref;
    await ref.update({ cardRemovalOverride:true, cardRemovalOverrideAt:new Date().toISOString(), cardRemovalOverrideBy: adminEmail });
    return { statusCode:200, body:'Waiver granted' };
  }catch(err){ console.error('grant-card-removal-waiver error', err); return { statusCode:500, body: err.message||String(err) }; }
};
