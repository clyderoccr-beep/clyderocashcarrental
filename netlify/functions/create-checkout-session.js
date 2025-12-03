/*
 * Netlify Function: create-checkout-session
 * Creates a Stripe Checkout Session for a booking payment.
 *
 * Environment Variables (set in Netlify UI > Site Settings > Build & Deploy > Environment):
 *   STRIPE_SECRET_KEY       (required) - Your live or test secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET   (optional for stripe-webhook function)
 *
 * Frontend flow:
 *   1. User enters bookingId + amount (cents) and clicks "Pay with Card / Apple Pay".
 *   2. JS calls POST /.netlify/functions/create-checkout-session with JSON { bookingId, amount }.
 *   3. This function creates a Checkout Session restricted to card (Apple Pay appears automatically on supported devices).
 *   4. Returns { url } and frontend redirects browser to the Stripe Checkout hosted page.
 *
 * Notes:
 *   - Do NOT enable automatic_payment_methods; specifying payment_method_types ['card'] keeps ONLY card + wallet methods (Apple Pay) when eligible.
 *   - Apple Pay requires domain verification via Stripe dashboard (Settings > Payment Methods > Apple Pay > Add domain).
 *   - Amount must be integer cents (e.g. $250 = 25000).
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { bookingId, amount, email } = body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return { statusCode: 500, body: 'Missing STRIPE_SECRET_KEY env variable.' };
    }
    if (!bookingId || typeof bookingId !== 'string') {
      return { statusCode: 400, body: 'Invalid bookingId.' };
    }
    if (!amount || typeof amount !== 'number' || amount < 50) {
      return { statusCode: 400, body: 'Invalid amount (must be integer cents >= 50).' };
    }

    // Ensure a Customer exists so the card can be saved on it
    let customerId = null;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id || (await stripe.customers.create({ email })).id;
    }

    // Create a Checkout Session and save card for future off-session charges
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // Restrict to card (Apple Pay still shows when eligible)
      customer: customerId || undefined,
      customer_email: customerId ? undefined : (email || undefined),
      // Save card on the PaymentIntent for future off-session usage
      payment_intent_data: {
        setup_future_usage: 'off_session',
        // Do not set customer inside payment_intent_data for Checkout; use top-level `customer`.
        metadata: { bookingId, userEmail: email||'' }
      },
      // Keep to card methods; Apple Pay still appears when eligible
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `CCR Booking ${bookingId}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId,
        origin: 'stripe_checkout',
        userEmail: email||'',
      },
      // Include bookingId + paid flag so frontend can mark booking as rented
      success_url: `${(process.env.URL||'https://clyderocashcarrental.netlify.app')}/#payments?paid=1&bookingId=${encodeURIComponent(bookingId)}`,
      cancel_url: `${(process.env.URL||'https://clyderocashcarrental.netlify.app')}/#payment-cancel`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    console.error('Checkout Session Error:', err);
    return { statusCode: 500, body: err.toString() };
  }
};
