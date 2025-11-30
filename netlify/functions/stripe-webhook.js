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
        const bookingId = session.metadata?.bookingId;
        console.log('Checkout completed for booking', bookingId, 'session', session.id);
        // TODO: Update booking status (accepted / paid) in Firestore or your DB.
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
