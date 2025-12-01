/*
 * Netlify Function: charge-late-fee
 * Attempts to charge a saved card (off_session) for an overdue booking's late fee.
 * Requires the user to have completed the Save Card flow (Stripe Checkout setup mode).
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getAdmin } = require('./_firebaseAdmin');

function computeLateFeeCents(returnDateIso){
  try{
    if(!returnDateIso) return 0;
    const due = new Date(returnDateIso);
    if(Number.isNaN(due.getTime())) return 0;
    const now = new Date();
    const ms = now - due;
    if(ms <= 0) return 0;
    const hours = Math.ceil(ms / (1000*60*60));
    const fee = Math.min(hours * 1500, 20000); // $15/h cap $200
    return fee;
  }catch{ return 0; }
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };
  try{
    if(!process.env.STRIPE_SECRET_KEY){ return { statusCode:500, body:'Missing STRIPE_SECRET_KEY' }; }
    const admin = getAdmin();
    const db = admin.firestore();
    const body = JSON.parse(event.body||'{}');
    const bookingId = (body.bookingId||'').trim();
    if(!bookingId) return { statusCode:400, body:'Missing bookingId' };
    // Load booking
    const doc = await db.collection('bookings').doc(bookingId).get();
    if(!doc.exists){ return { statusCode:404, body:'Booking not found' }; }
    const bk = doc.data();
    const lateFeeCents = computeLateFeeCents(bk.returnDate);
    if(lateFeeCents <= 0){ return { statusCode:200, body: JSON.stringify({ charged:false, reason:'not_late' }) } }
    const email = bk.userEmail;
    if(!email){ return { statusCode:400, body:'Booking missing userEmail' } }
    // Load user by email
    const uq = await db.collection('users').where('email','==',email).limit(1).get();
    if(uq.empty){ return { statusCode:400, body:'User record not found' } }
    const user = uq.docs[0].data();
    const customer = user.stripeCustomerId;
    const pm = user.stripeDefaultPm;
    if(!customer || !pm){ return { statusCode:400, body:'No saved card on file' } }
    // Charge late fee now (do NOT include processing fees to avoid overcharging without consent)
    const intent = await stripe.paymentIntents.create({
      amount: lateFeeCents,
      currency: 'usd',
      customer: customer,
      payment_method: pm,
      off_session: true,
      confirm: true,
      description: `CCR Late Fee for Booking ${bookingId}`,
      metadata: { bookingId, kind:'late_fee' }
    });
    // Update booking
    await doc.ref.update({ lateFeePaid:true, lateFeeCents: lateFeeCents, paidAt: new Date().toISOString(), status:'paid' });
    // Audit: late-fee charge
    try{
      await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/audit-booking-event` : '/.netlify/functions/audit-booking-event', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          bookingId, eventType: 'late_fee_charged', userEmail: email, lateFeeCents,
          paymentProvider: 'Stripe', paymentSessionId: intent.id, agreementVersion: '',
          snapshot: { booking: bk, paymentIntent: { id: intent.id, amount: intent.amount, status: intent.status } }
        })
      });
    }catch(e){ console.warn('Late-fee audit failed', e.message); }
    return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ charged:true, paymentIntentId: intent.id }) };
  }catch(err){
    console.error('charge-late-fee error', err);
    // For SCA required cases, inform caller to ask customer to complete authentication
    return { statusCode: 500, body: err.message || String(err) };
  }
};
