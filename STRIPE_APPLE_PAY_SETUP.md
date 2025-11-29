# Stripe + Apple Pay Setup Guide

## What's Been Added

✅ **Backend**: Firebase Function `createPaymentIntent` to process payments  
✅ **Frontend**: Stripe Payment Element with Apple Pay, Google Pay, and card support  
✅ **UI**: Payment form in Payments section with booking ID and amount fields

---

## Setup Steps

### 1. Create Stripe Account

1. Go to https://stripe.com and sign up
2. Complete account verification
3. Get your API keys from: https://dashboard.stripe.com/test/apikeys

You'll see:
- **Publishable key** (starts with `pk_test_...`)
- **Secret key** (starts with `sk_test_...`)

---

### 2. Update Frontend with Publishable Key

**File**: `script.js` (line ~2083)

Replace this line:
```javascript
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51QQpV6AelR3kYJDzDAnqJgBw8TnXPhRLm8QDPRVDKcNbPa8rGvF8sZYJLdTrxoWbGHaIccVCxDJHHrOm8vsDbfLV00aTQcWNFn';
```

With your actual publishable key:
```javascript
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY_HERE';
```

---

### 3. Install Stripe in Firebase Functions

```bash
cd "C:\Users\DELL\Downloads\MY WEBSIDE CAR RENTAL\functions"
npm install
```

---

### 4. Set Stripe Secret Key as Environment Variable

**Option A: Firebase CLI (Recommended)**
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# Paste your sk_test_... key when prompted
```

**Option B: Manual .env (Local Testing)**
Create `functions/.env`:
```
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
```

---

### 5. Deploy Firebase Functions

```bash
cd "C:\Users\DELL\Downloads\MY WEBSIDE CAR RENTAL"
firebase deploy --only functions
```

This deploys the `createPaymentIntent` function.

---

### 6. Enable Apple Pay in Stripe Dashboard

1. Go to: https://dashboard.stripe.com/settings/payment_methods
2. Enable **Apple Pay**
3. Add your domain (e.g., `clyderoccr.com` or Netlify URL)
4. Download the Apple verification file: `apple-developer-merchantid-domain-association`
5. Place it in: `C:\Users\DELL\Downloads\MY WEBSIDE CAR RENTAL\.well-known\`
6. Deploy to Netlify so it's accessible at: `https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association`

---

### 7. Test Payment Flow

**On Desktop (Chrome/Firefox):**
- Go to Payments section
- Enter booking ID and amount
- Click "Pay Now"
- Test card: `4242 4242 4242 4242`, any future expiry, any CVC

**On iPhone/Mac (Safari):**
- Apple Pay button should appear automatically
- Use Sandbox Apple Pay card (configure in Settings > Wallet)

---

## How It Works

### Customer Flow
1. Customer goes to **Payments** section
2. Enters **Booking ID** (from My Account bookings)
3. Enters **Amount** (weekly rental price)
4. Clicks **Pay Now**
5. Stripe Payment Element shows:
   - 🍎 **Apple Pay** (iPhone/Mac Safari)
   - 🟢 **Google Pay** (Android Chrome)
   - 💳 **Card** (all browsers)
6. Payment processes securely via Stripe
7. Success/failure message displays

### Backend Flow
1. Frontend calls Firebase Function `createPaymentIntent`
2. Function creates Stripe PaymentIntent with metadata:
   - Booking ID
   - User email
   - Vehicle name
   - Amount
3. Returns `clientSecret` to frontend
4. Frontend confirms payment using Stripe.js
5. Stripe processes payment (Apple Pay/Card/Google Pay)

---

## Next Steps (Optional Enhancements)

### Link Payment to Booking
After successful payment, save transaction ID to booking:

```javascript
// In script.js, after payment succeeds:
const db = getDB();
const { doc, updateDoc } = getUtils();
await updateDoc(doc(db, 'bookings', bookingId), {
  paymentStatus: 'paid',
  stripePaymentId: paymentIntent.id,
  paidAt: Date.now(),
  paidAmount: amount
});
```

### Webhook for Payment Confirmation
Create `functions/index.js` webhook to handle `payment_intent.succeeded`:

```javascript
exports.stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = 'whsec_...'; // From Stripe dashboard
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const bookingId = paymentIntent.metadata.bookingId;
    
    // Update booking in Firestore
    await admin.firestore().collection('bookings').doc(bookingId).update({
      paymentStatus: 'paid',
      stripePaymentId: paymentIntent.id,
      paidAt: Date.now()
    });
  }

  res.json({ received: true });
});
```

---

## Troubleshooting

### Apple Pay not showing?
- Must use **HTTPS** (localhost or deployed site)
- Must use **Safari** on iPhone/Mac
- Check Stripe dashboard: Payment Methods > Apple Pay enabled
- Verify domain added in Stripe

### "Function not found" error?
```bash
firebase deploy --only functions
```

### Payment failing?
- Check Firebase Functions logs: `firebase functions:log`
- Verify `STRIPE_SECRET_KEY` is set
- Use test card: `4242 4242 4242 4242`

### CORS errors?
- Ensure Netlify/hosting serves `.well-known` folder
- Check `netlify.toml` includes redirects

---

## Summary

✅ **Code is ready** - just need Stripe keys  
✅ **Backend function** - creates PaymentIntent  
✅ **Frontend UI** - Stripe Payment Element  
✅ **Apple Pay** - works automatically on Safari/iOS  
✅ **Test mode** - safe to test with fake cards  

**Next**: Get your Stripe keys and follow steps 2-7 above!
