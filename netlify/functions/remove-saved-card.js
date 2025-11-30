/*
 * Netlify Function: remove-saved-card
 * Detaches the saved payment method from the Stripe customer and clears
 * the saved-card fields on the user's Firestore profile.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

function ensureAdmin(){ if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); } }

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };
  try{
    ensureAdmin();
    const db = admin.firestore();
    const body = JSON.parse(event.body||'{}');
    const email = (body.email||'').trim();
    if(!email) return { statusCode:400, body:'Missing email' };
    const uq = await db.collection('users').where('email','==',email).limit(1).get();
    if(uq.empty) return { statusCode:404, body:'User not found' };
    const ref = uq.docs[0].ref; const user = uq.docs[0].data();
    const pm = user.stripeDefaultPm;
    try{ if(pm){ await stripe.paymentMethods.detach(pm); } }catch(e){ console.warn('Stripe detach failed', e.message); }
    await ref.update({ stripeDefaultPm: admin.firestore.FieldValue.delete(), cardOnFile: false });
    return { statusCode:200, body:'Removed' };
  }catch(err){ console.error('remove-saved-card error', err); return { statusCode:500, body: err.message||String(err) }; }
};
