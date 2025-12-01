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
    // Honor admin override / waiver
    const override = !!user.cardRemovalOverride;
    // Debt / overdue check: block removal if any overdue unpaid booking or unpaid late fee
    try{
      const bookingsQ = await db.collection('bookings').where('userEmail','==',email).get();
      const now = Date.now();
      let owes = false;
      bookingsQ.forEach(bdoc => {
        const b = bdoc.data();
        const retMs = b.returnDate ? new Date(b.returnDate).getTime() : 0;
        const overdue = retMs && now > retMs;
        const unpaidLate = overdue && !b.lateFeePaid;
        const activeStatus = ['active','extended','pending','rented'].includes(b.status||'');
        if(activeStatus && (unpaidLate || (overdue && !b.paidAt))) owes = true;
      });
      if(!override && owes){
        return { statusCode:400, body:'Cannot remove card: outstanding overdue booking or unpaid late fee.' };
      }
    }catch(e){ console.warn('Debt check failed (remove card)', e.message); }
    const pm = user.stripeDefaultPm;
    try{ if(pm){ await stripe.paymentMethods.detach(pm); } }catch(e){ console.warn('Stripe detach failed', e.message); }
    await ref.update({ stripeDefaultPm: admin.firestore.FieldValue.delete(), cardOnFile: false });
    return { statusCode:200, body:'Removed' };
  }catch(err){ console.error('remove-saved-card error', err); return { statusCode:500, body: err.message||String(err) }; }
};
