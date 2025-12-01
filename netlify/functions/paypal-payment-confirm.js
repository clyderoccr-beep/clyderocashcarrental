/*
 * Netlify Function: paypal-payment-confirm
 * Verifies a PayPal order after client approval.
 *
 * Expected POST body JSON: { orderId, bookingId, amount }
 *  - orderId: PayPal order ID returned by Buttons SDK after createOrder
 *  - bookingId: Your internal booking reference (optional for now)
 *  - amount: Expected amount in cents (for future validation)
 *
 * Environment Variables (Netlify UI):
 *   PAYPAL_CLIENT_ID     (sandbox or live)
 *   PAYPAL_CLIENT_SECRET (sandbox or live)
 *
 * Flow:
 *   1. Client renders PayPal Buttons with purchase_units including value.
 *   2. onApprove gives data.orderID.
 *   3. Client POSTs to /.netlify/functions/paypal-payment-confirm with orderId.
 *   4. This function fetches order details from PayPal REST API and returns status.
 *
 * NOTE: For full production usage you should CAPTURE the order server-side (currently Buttons auto-capture by default). If not captured yet, add capture endpoint:
 *   POST https://api-m.paypal.com/v2/checkout/orders/{orderId}/capture
 */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { orderId, bookingId } = body;

    if (!orderId) {
      return { statusCode: 400, body: 'Missing orderId' };
    }
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { statusCode: 500, body: 'PayPal env vars missing.' };
    }

    // OAuth token
    const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!tokenRes.ok) {
      throw new Error('PayPal token error ' + tokenRes.status);
    }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;

    // Fetch order details
    const orderRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`, { headers: { 'Authorization': 'Bearer ' + accessToken } });
    const orderJson = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error('PayPal order fetch failed ' + orderRes.status + ': ' + JSON.stringify(orderJson));
    }

    // Basic status & amount extraction
    const status = orderJson.status;
    let amountValue = null;
    try {
      amountValue = orderJson.purchase_units?.[0]?.amount?.value || null;
    } catch {}

    // Persist booking payment record to Firestore and notify owner
    console.log('PayPal order verified', { orderId, status, bookingId, amountValue });
    try{
      const admin = require('firebase-admin');
      if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); }
      const db = admin.firestore();
      if(bookingId){
        const docRef = db.collection('bookings').doc(bookingId);
        const docSnap = await docRef.get();
        const update = { status: 'paid', paidAt: new Date().toISOString() };
        if(docSnap.exists){ await docRef.update(update); }
        else {
          const q = await db.collection('bookings').where('id','==',bookingId).limit(1).get();
          const ref = q.docs[0]?.ref; if(ref) await ref.update(update);
        }
      }
    }catch(e){ console.warn('Firestore booking update failed (PayPal)', e.message); }

    // Owner email notification
    try{
      await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/notify-event` : '/.netlify/functions/notify-event', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          to: 'clyderoccr@gmail.com', type: 'payment', provider: 'PayPal', bookingId,
          userEmail: '', amountCents: Math.round(Number(amountValue||0) * 100), sessionId: orderId,
          details: { status }
        })
      });
    }catch(e){ console.warn('PayPal owner notify failed', e.message); }
    // Audit: payment
    try{
      const admin = require('firebase-admin');
      if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); }
      const db = admin.firestore();
      const bkSnap = await db.collection('bookings').doc(bookingId).get();
      const bk = bkSnap.exists ? bkSnap.data() : {};
      await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/audit-booking-event` : '/.netlify/functions/audit-booking-event', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          bookingId, eventType: 'payment', userEmail: bk.userEmail||'', rateCents: Math.round(Number(amountValue||0) * 100),
          paymentProvider: 'PayPal', paymentSessionId: orderId, agreementVersion: '',
          snapshot: { booking: bk, order: { id: orderId, status } }
        })
      });
    }catch(e){ console.warn('PayPal audit failed', e.message); }

    return {
      statusCode: 200,
      body: JSON.stringify({ status, orderId, amountValue, bookingId }),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (err) {
    console.error('PayPal confirm error:', err);
    return { statusCode: 500, body: err.toString() };
  }
};
