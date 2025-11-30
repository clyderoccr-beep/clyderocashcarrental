const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Lazy SendGrid init (only if secrets provided)
let sgMail = null;
if(process.env.SENDGRID_API_KEY){
  try{
    sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('SendGrid initialized');
  }catch(e){ console.warn('SendGrid init failed:', e.message); }
}

admin.initializeApp();

const OWNER_EMAIL = 'clyderofraser97@gmail.com';

/**
 * Callable function to delete a user's Firestore profile and Firebase Auth account.
 * Only accessible by the owner email.
 * 
 * @param {string} data.userId - The UID of the user to delete
 * @returns {object} { success: true, message: '...' }
 */
exports.deleteUser = onCall(async (request) => {
  // 1. Verify caller is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in to call this function.');
  }

  // 2. Verify caller is the owner
  const callerEmail = request.auth.token.email;
  if (callerEmail !== OWNER_EMAIL) {
    throw new HttpsError('permission-denied', 'Only the owner can delete users.');
  }

  // 3. Extract userId from request data
  const { userId } = request.data;
  if (!userId || typeof userId !== 'string') {
    throw new HttpsError('invalid-argument', 'userId is required and must be a string.');
  }

  try {
    // 4. Delete Firestore user document
    await admin.firestore().collection('users').doc(userId).delete();
    console.log(`Deleted Firestore doc for user: ${userId}`);

    // 5. Delete Firebase Auth user
    await admin.auth().deleteUser(userId);
    console.log(`Deleted Auth account for user: ${userId}`);

    return {
      success: true,
      message: `User ${userId} deleted successfully (Firestore + Auth).`
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    throw new HttpsError('internal', `Failed to delete user: ${error.message}`);
  }
});

/**
 * Create a Stripe PaymentIntent for booking payments.
 * Supports Apple Pay, Google Pay, and card payments.
 * 
 * @param {number} data.amount - Amount in cents (e.g., 25000 = $250.00)
 * @param {string} data.currency - Currency code (default: 'usd')
 * @param {string} data.bookingId - Associated booking ID
 * @param {string} data.vehicleName - Vehicle name for receipt
 * @returns {object} { clientSecret, paymentIntentId }
 */
exports.createPaymentIntent = onCall(async (request) => {
  // Verify caller is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in to create payment.');
  }

  const { amount, currency = 'usd', bookingId, vehicleName, lateFee = 0, weeklyPrice = 0 } = request.data;

  // Validate amount
  if (!amount || typeof amount !== 'number' || amount < 50) {
    throw new HttpsError('invalid-argument', 'Amount must be at least 50 cents.');
  }

  // Validate bookingId
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'bookingId is required.');
  }

  try {
    // Create PaymentIntent
    const isExtension = /_extend1w$/.test(bookingId);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure integer
      currency: currency.toLowerCase(),
      payment_method_types: ['card'], // Restrict to card (Apple Pay via Payment Request counts as card)
      metadata: {
        bookingId,
        vehicleName: vehicleName || 'Unknown Vehicle',
        userEmail: request.auth.token.email || 'unknown',
        userId: request.auth.uid,
        isExtension: isExtension ? '1' : '0',
        lateFee: String(lateFee || 0),
        weeklyPrice: String(weeklyPrice || 0)
      },
      description: `Clydero CCR - ${vehicleName || 'Vehicle'} rental (Booking: ${bookingId})`,
    });

    console.log(`Created PaymentIntent: ${paymentIntent.id} for booking: ${bookingId}`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error('Stripe PaymentIntent creation failed:', error);
    throw new HttpsError('internal', `Payment setup failed: ${error.message}`);
  }
});

/**
 * Stripe Webhook to handle payment events.
 * - Verifies signature using STRIPE_WEBHOOK_SECRET
 * - On payment_intent.succeeded: updates Firestore bookings
 *   - Initial payment: marks booking as paid/accepted
 *   - Extension (bookingId ends with _extend1w): adds 7 days to returnDate
 */
exports.stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    res.status(500).send('Webhook secret not configured');
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const md = pi.metadata || {};
      const bookingId = md.bookingId || '';
      const userEmail = md.userEmail || '';
      const isExtensionMeta = md.isExtension === '1';
      const lateFeeMeta = parseInt(md.lateFee || '0', 10) || 0;
      const weeklyPriceMeta = parseInt(md.weeklyPrice || '0', 10) || 0;

      if (!bookingId) {
        console.warn('Payment succeeded without bookingId');
      } else {
        const db = admin.firestore();
        // bookingId can be Firestore doc id or local id; prefer matching Firestore id
        let docRef = null;
        if (bookingId) {
          // If bookingId has suffix _extend1w, strip it for lookup
          const pureId = bookingId.replace(/_extend1w$/, '');
          docRef = db.collection('bookings').doc(pureId);
        }

        if (docRef) {
          const snap = await docRef.get();
          if (snap.exists) {
            const data = snap.data() || {};
            const isExtension = /_extend1w$/.test(bookingId) || isExtensionMeta;
            if (isExtension) {
              // Add 7 days to returnDate
              const curr = data.returnDate ? new Date(data.returnDate) : new Date();
              curr.setDate(curr.getDate() + 7);
              const newReturn = curr.toISOString().slice(0, 10);
              await docRef.update({
                returnDate: newReturn,
                status: 'rented',
                lastPaymentAt: Date.now(),
                lastPaymentIntentId: pi.id,
                lastPaymentAmount: pi.amount_received || pi.amount || 0,
                extensionsCount: (data.extensionsCount || 0) + 1,
                lastExtensionLateFee: lateFeeMeta,
                lastExtensionWeeklyPrice: weeklyPriceMeta,
              });
              console.log('Booking extended 1 week via payment:', pureId, newReturn);
              // Send extension receipt
              await sendPaymentEmail({
                to: userEmail,
                subject: 'Extension Confirmed - Clydero CCR',
                text: `Your booking (${pureId}) was extended by 1 week. New return date: ${newReturn}. Amount paid: $${(pi.amount_received||pi.amount||0)/100}. Weekly price: $${(weeklyPriceMeta/100).toFixed(2)} Late fee: $${(lateFeeMeta/100).toFixed(2)}`,
                bookingId: pureId,
                amount: (pi.amount_received||pi.amount||0),
                isExtension: true,
                returnDate: newReturn
              });
            } else {
              // Initial payment: mark accepted/paid
              await docRef.update({
                status: data.status === 'rented' ? 'rented' : 'accepted',
                lastPaymentAt: Date.now(),
                lastPaymentIntentId: pi.id,
                lastPaymentAmount: pi.amount_received || pi.amount || 0,
              });
              console.log('Booking payment recorded:', bookingId);
              // Send initial payment receipt
              await sendPaymentEmail({
                to: userEmail,
                subject: 'Payment Received - Clydero CCR',
                text: `Thank you. Your payment for booking ${bookingId} was successful. Amount: $${(pi.amount_received||pi.amount||0)/100}.`,
                bookingId,
                amount: (pi.amount_received||pi.amount||0),
                isExtension: false,
                returnDate: data.returnDate || ''
              });
            }
          } else {
            console.warn('Booking doc not found for', bookingId);
          }
        }
      }
    }
    else if(event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const md = pi.metadata || {};
      const bookingId = md.bookingId || '';
      if(bookingId){
        try{
          const db = admin.firestore();
            const pureId = bookingId.replace(/_extend1w$/, '');
            const docRef = db.collection('bookings').doc(pureId);
            const snap = await docRef.get();
            if(snap.exists){
              await docRef.update({
                lastPaymentStatus: 'failed',
                lastPaymentAttemptAt: Date.now(),
                lastPaymentIntentId: pi.id,
              });
              await sendPaymentEmail({
                to: md.userEmail || '',
                subject: 'Payment Failed - Clydero CCR',
                text: `Your payment attempt for booking ${pureId} failed. Please retry.`,
                bookingId: pureId,
                amount: pi.amount || 0,
                isExtension: /_extend1w$/.test(bookingId),
                returnDate: snap.data().returnDate || ''
              });
              console.log('Recorded failed payment for booking', pureId);
            }
        }catch(e){ console.warn('Failed to record payment failure:', e.message); }
      }
    }

    // You can handle other event types if needed
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing failed:', err.message);
    res.status(500).send('Webhook handler error');
  }
});

// Helper to send payment emails (no-op if SendGrid not configured or email invalid)
async function sendPaymentEmail(opts){
  try{
    if(!sgMail){ return; }
    const to = (opts.to||'').trim();
    if(!to || !/@/.test(to)){ return; }
    const from = process.env.SENDGRID_FROM_EMAIL || 'no-reply@clyderoccr.example';
    const amountUsd = (opts.amount||0)/100;
    const lines = [
      opts.text||'',
      '',
      `Booking: ${opts.bookingId}`,
      `Amount: $${amountUsd.toFixed(2)}`,
      opts.returnDate?`Return Date: ${opts.returnDate}`:'',
      opts.isExtension? 'Type: Extension' : 'Type: Initial Payment'
    ].filter(Boolean).join('\n');
    await sgMail.send({
      to,
      from,
      subject: opts.subject||'Payment Receipt',
      text: lines
    });
    console.log('Payment email sent to', to);
  }catch(e){ console.warn('Failed to send payment email:', e.message); }
}

// ===== PayPal Integration (Orders API) =====
/**
 * createPaypalOrder - callable to create a PayPal order for a booking.
 * Requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET set as function secrets.
 * data: { amount: cents, bookingId, vehicleName }
 * Returns { orderId }
 */
exports.createPaypalOrder = onCall(async (request) => {
  if(!request.auth){ throw new HttpsError('unauthenticated','Must be signed in.'); }
  const { amount, bookingId, vehicleName = 'Vehicle Rental' } = request.data || {};
  if(!amount || typeof amount !== 'number' || amount < 50){ throw new HttpsError('invalid-argument','Amount invalid.'); }
  if(!bookingId || typeof bookingId !== 'string'){ throw new HttpsError('invalid-argument','bookingId required.'); }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if(!clientId || !clientSecret){ throw new HttpsError('failed-precondition','PayPal secrets not configured.'); }
  try{
    // OAuth token
    const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method:'POST',
      headers:{ 'Authorization':'Basic '+ Buffer.from(clientId+':'+clientSecret).toString('base64'), 'Content-Type':'application/x-www-form-urlencoded' },
      body:'grant_type=client_credentials'
    });
    if(!tokenRes.ok){ throw new Error('PayPal token failed '+tokenRes.status); }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    const decimal = (amount/100).toFixed(2);
    const orderRes = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+accessToken, 'Content-Type':'application/json' },
      body: JSON.stringify({
        intent:'CAPTURE',
        purchase_units:[{ reference_id: bookingId, amount:{ currency_code:'USD', value: decimal }, description: `Clydero CCR - ${vehicleName}` }],
        application_context:{ shipping_preference:'NO_SHIPPING' }
      })
    });
    const orderJson = await orderRes.json();
    if(!orderRes.ok){ throw new Error('Create order failed '+orderRes.status+': '+JSON.stringify(orderJson)); }
    console.log('Created PayPal order', orderJson.id, 'for booking', bookingId);
    return { orderId: orderJson.id };
  }catch(e){ console.error('PayPal order error', e); throw new HttpsError('internal', e.message); }
});

/**
 * capturePaypalOrder - callable to capture a previously created PayPal order.
 * data: { orderId, bookingId }
 * Updates Firestore booking on success.
 * Returns { status, captureId }
 */
exports.capturePaypalOrder = onCall(async (request) => {
  if(!request.auth){ throw new HttpsError('unauthenticated','Must be signed in.'); }
  const { orderId, bookingId } = request.data || {};
  if(!orderId || typeof orderId!=='string'){ throw new HttpsError('invalid-argument','orderId required'); }
  if(!bookingId || typeof bookingId!=='string'){ throw new HttpsError('invalid-argument','bookingId required'); }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if(!clientId || !clientSecret){ throw new HttpsError('failed-precondition','PayPal secrets not configured.'); }
  try{
    const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method:'POST',
      headers:{ 'Authorization':'Basic '+ Buffer.from(clientId+':'+clientSecret).toString('base64'), 'Content-Type':'application/x-www-form-urlencoded' },
      body:'grant_type=client_credentials'
    });
    if(!tokenRes.ok){ throw new Error('PayPal token failed '+tokenRes.status); }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    const capRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+accessToken, 'Content-Type':'application/json' }
    });
    const capJson = await capRes.json();
    if(!capRes.ok){ throw new Error('Capture failed '+capRes.status+': '+JSON.stringify(capJson)); }
    const status = capJson.status;
    let amountValue = 0;
    try{ amountValue = parseFloat(capJson.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || '0'); }catch{}
    const captureId = capJson.purchase_units?.[0]?.payments?.captures?.[0]?.id || '';
    // Update booking
    const db = admin.firestore();
    const docRef = db.collection('bookings').doc(bookingId.replace(/_extend1w$/, ''));
    const snap = await docRef.get();
    if(snap.exists){
      await docRef.update({
        lastPaypalOrderId: orderId,
        lastPaypalCaptureId: captureId,
        lastPaypalStatus: status,
        lastPaypalAmount: amountValue,
        lastPaymentAt: Date.now(),
        status: snap.data().status==='rented' ? 'rented' : 'accepted'
      });
    }
    console.log('Captured PayPal order', orderId, 'status', status);
    return { status, captureId };
  }catch(e){ console.error('PayPal capture error', e); throw new HttpsError('internal', e.message); }
});
