/*
 * Netlify Function: stripe-webhook
 * Handles Stripe webhook events (payment success/failure) for Checkout Sessions.
 *
 * IMPORTANT: Enable raw body passthrough in Netlify by adding this file name pattern
 * or using Netlify CLI local dev. Netlify provides event.body as a string.
 * Stripe signature verification requires the exact raw payload.
 *
 * Environment Variable:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  (The webhook signing secret from Stripe dashboard)
 *
 * Add endpoint in Stripe Dashboard: https://dashboard.stripe.com/webhooks
 *   URL: https://clyderoccr.com/.netlify/functions/stripe-webhook
 *   Events: checkout.session.completed (and others if needed)
 *
 * TODO: After verification of session:
 *   - Look up bookingId = session.metadata.bookingId
 *   - Update booking status in Firestore / database
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const sig = event.headers['stripe-signature'];
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('Missing STRIPE_WEBHOOK_SECRET');
    return { statusCode: 500, body: 'Webhook secret not configured.' };
  }

  let rawBody = event.body; // Netlify: body is a string. Ensure NOT parsed before verification.
  let evt;
  try {
    evt = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Webhook signature invalid.' };
  }

  try {
    switch (evt.type) {
      case 'checkout.session.completed': {
        const session = evt.data.object;
        // If setup mode (save card)
        if(session.mode === 'setup'){
          try{
            const admin = require('firebase-admin');
            if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); }
            const db = admin.firestore();
            const email = session.customer_details?.email || session.metadata?.userEmail || '';
            const setupIntentId = session.setup_intent;
            if(email && setupIntentId){
              const si = await stripe.setupIntents.retrieve(setupIntentId);
              const pm = si.payment_method;
              const customer = si.customer || session.customer;
              if(customer && pm){
                // Upsert into users collection by email
                const q = await db.collection('users').where('email','==',email).limit(1).get();
                if(!q.empty){
                  await q.docs[0].ref.update({
                    stripeCustomerId: String(customer),
                    stripeDefaultPm: String(pm),
                    cardOnFile: true,
                    cardSavedAt: new Date().toISOString()
                  });
                }
              }
            }
          }catch(e){ console.warn('Failed to store saved card details', e.message); }
        } else {
          // Payment mode (booking payment)
          const bookingId = session.metadata?.bookingId;
          const lateFeeCents = Number(session.metadata?.lateFee || 0);
          console.log('Checkout completed for booking', bookingId, 'session', session.id, 'lateFeeCents', lateFeeCents);
          // Mark booking paid in Firestore if available
          try{
            const admin = require('firebase-admin');
            if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); }
            const db = admin.firestore();
            if(bookingId){
              const docRef = db.collection('bookings').doc(bookingId);
              const docSnap = await docRef.get();
              if(docSnap.exists){
                await docRef.update({ status:'paid', lateFeePaid:true, lateFeeCents, paidAt: new Date().toISOString() });
              } else {
                const q = await db.collection('bookings').where('id','==',bookingId).limit(1).get();
                const ref = q.docs[0]?.ref; if(ref){ await ref.update({ status:'paid', lateFeePaid:true, lateFeeCents, paidAt: new Date().toISOString() }); }
              }
            }
            // Also store saved card details for future late-fee charges
            try{
              const email = session.customer_details?.email || session.metadata?.userEmail || '';
              if(email && session.payment_intent){
                const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
                const customer = pi.customer || session.customer;
                const pm = pi.payment_method;
                if(customer && pm){
                  const uq = await db.collection('users').where('email','==',email).limit(1).get();
                  if(!uq.empty){
                    await uq.docs[0].ref.update({
                      stripeCustomerId: String(customer),
                      stripeDefaultPm: String(pm),
                      cardOnFile: true,
                      cardSavedAt: new Date().toISOString()
                    });
                  }
                }
              }
            }catch(e){ console.warn('Failed to store saved card from payment', e.message); }

            // Owner notification email via serverless (Gmail SMTP)
            try{
              const totalCents = Number(session.amount_total || 0);
              const email = session.customer_details?.email || session.metadata?.userEmail || '';
              const payload = {
                to: 'clyderoccr@gmail.com',
                type: 'payment',
                provider: 'Stripe',
                bookingId,
                userEmail: email,
                amountCents: totalCents,
                lateFeeCents,
                sessionId: session.id
              };
              await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/notify-event` : '/.netlify/functions/notify-event', {
                method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
              });
            }catch(e){ console.warn('Stripe owner notify failed', e.message); }
          }catch(e){ console.warn('Firestore booking update failed in webhook', e.message); }
        }
        break;
      }
      default:
        console.log('Unhandled event type:', evt.type);
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: 'Webhook processing error.' };
  }
};
