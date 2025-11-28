const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

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
