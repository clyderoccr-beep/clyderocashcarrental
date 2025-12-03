/*
 * Netlify Function: create-setup-session
 * Creates a Stripe Checkout Session in setup mode to save a card on file
 * for future off_session charges (late fees).
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try{
    if(!process.env.STRIPE_SECRET_KEY){
      return { statusCode: 500, body: 'Missing STRIPE_SECRET_KEY' };
    }
    const body = JSON.parse(event.body||'{}');
    const email = (body.email||'').trim();
    if(!email){
      return { statusCode: 400, body: 'Missing email' };
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['card'],
      customer_email: email,
      metadata: { origin: 'save_card', userEmail: email },
      success_url: `${(process.env.URL||'https://clyderocashcarrental.netlify.app')}/#payments?saved=1`,
      cancel_url: `${(process.env.URL||'https://clyderocashcarrental.netlify.app')}/#payments?saveCanceled=1`
    });
    return { statusCode: 200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: session.url }) };
  }catch(err){
    console.error('create-setup-session error', err);
    return { statusCode: 500, body: err.message||String(err) };
  }
};
