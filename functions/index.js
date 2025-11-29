const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

  const { amount, currency = 'usd', bookingId, vehicleName } = request.data;

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
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure integer
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true, // Enables Apple Pay, Google Pay, cards
      },
      metadata: {
        bookingId,
        vehicleName: vehicleName || 'Unknown Vehicle',
        userEmail: request.auth.token.email || 'unknown',
        userId: request.auth.uid,
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
