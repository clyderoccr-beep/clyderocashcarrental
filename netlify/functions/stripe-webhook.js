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
 *   Events: checkout.session.completed, payment_intent.succeeded
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
            const { getAdmin } = require('./_firebaseAdmin');
            const admin = getAdmin();
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
          // Payment mode (booking payment or host subscription)
          const bookingId = session.metadata?.bookingId;
          const isHostSubscription = session.metadata?.isHostSubscription === 'true';
          const hostEmail = session.metadata?.hostEmail || session.customer_details?.email || '';
          const planType = session.metadata?.planType;
          const price = Number(session.metadata?.price || 0);
          const vehicleLimit = Number(session.metadata?.vehicleLimit || 5);
          const lateFeeCents = Number(session.metadata?.lateFee || 0);
          
          console.log('Checkout completed - isHostSubscription:', isHostSubscription, 'bookingId:', bookingId, 'hostEmail:', hostEmail);
          
          // Handle host subscription payment
          if(isHostSubscription && hostEmail && planType) {
            try{
              const { getAdmin } = require('./_firebaseAdmin');
              const admin = getAdmin();
              const db = admin.firestore();
              
              // Find user by email and update subscription
              const userQuery = await db.collection('users').where('email', '==', hostEmail).limit(1).get();
              if(!userQuery.empty) {
                const userDoc = userQuery.docs[0];
                const renewalDate = new Date();
                renewalDate.setDate(renewalDate.getDate() + 30); // 30 days from now
                
                await userDoc.ref.update({
                  hostSubscription: {
                    plan: planType,
                    price: price,
                    vehicleLimit: vehicleLimit,
                    renewalDate: renewalDate.toISOString(),
                    active: true,
                    activatedAt: new Date().toISOString(),
                    paymentId: session.payment_intent,
                    stripeSessionId: session.id
                  },
                  accountType: 'host', // Ensure account is marked as host
                  hostActive: true,
                  hostBanned: false
                });
                
                console.log('Host subscription activated for:', hostEmail, 'plan:', planType);
              }
              
              // Send confirmation email
              try{
                const payload = {
                  to: hostEmail,
                  type: 'host_subscription',
                  planType: planType,
                  price: price,
                  vehicleLimit: vehicleLimit,
                  renewalDate: new Date(new Date().getTime() + 30*24*60*60*1000).toISOString()
                };
                await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/notify-event` : '/.netlify/functions/notify-event', {
                  method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
                });
              }catch(e){ console.warn('Host subscription email failed', e.message); }
              
            }catch(e){ console.warn('Host subscription activation failed', e.message); }
          } 
          // Handle booking payment
          else if(bookingId) {
            console.log('Checkout completed for booking', bookingId, 'session', session.id, 'lateFeeCents', lateFeeCents);
            // Mark booking paid in Firestore if available
            try{
              const { getAdmin } = require('./_firebaseAdmin');
              const admin = getAdmin();
              const db = admin.firestore();
              const docRef = db.collection('bookings').doc(bookingId);
              const docSnap = await docRef.get();
              if(docSnap.exists){
                await docRef.update({ status:'paid', lateFeePaid:true, lateFeeCents, paidAt: new Date().toISOString() });
              } else {
                const q = await db.collection('bookings').where('id','==',bookingId).limit(1).get();
                const ref = q.docs[0]?.ref; if(ref){ await ref.update({ status:'paid', lateFeePaid:true, lateFeeCents, paidAt: new Date().toISOString() }); }
              }
            }catch(e){ console.warn('Firestore booking update failed in webhook', e.message); }
          }
            // Also store saved card details from the payment for future late-fee charges
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
            // Audit: payment
            try{
              const bkSnap = docSnap.exists ? docSnap.data() : (await db.collection('bookings').where('id','==',bookingId).limit(1).get()).docs[0]?.data()||{};
              await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/audit-booking-event` : '/.netlify/functions/audit-booking-event', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({
                  bookingId: docSnap.exists ? bookingId : (bkSnap.id||bookingId), eventType: 'payment',
                  userEmail: session.customer_details?.email || session.metadata?.userEmail || '',
                  rateCents: Number(session.amount_total || 0) - lateFeeCents, lateFeeCents,
                  paymentProvider: 'Stripe', paymentSessionId: session.id, agreementVersion: '',
                  snapshot: { booking: bkSnap, session: { id: session.id, mode: session.mode, amount_total: session.amount_total } }
                })
              });
            }catch(e){ console.warn('Stripe audit failed', e.message); }
          }catch(e){ console.warn('Firestore booking update failed in webhook', e.message); }
        }
        break;
      }
      break;
      case 'payment_intent.succeeded': {
        // Redundant safety: when PaymentIntent succeeds outside Checkout, still persist IDs
        try{
          const pi = evt.data.object;
          const bookingId = pi.metadata?.bookingId;
          const email = pi.metadata?.userEmail || '';
          const customer = pi.customer;
          const pm = pi.payment_method;
          if(customer && pm){
            const { getAdmin } = require('./_firebaseAdmin');
            const admin = getAdmin();
            const db = admin.firestore();
            if(email){
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
        }catch(e){ console.warn('payment_intent.succeeded persistence failed', e.message); }
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
