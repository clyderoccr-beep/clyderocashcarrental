const admin = require('./_firebaseAdmin');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { hostEmail, hostPhone, vehicleMakeModel, customerName, bookingDate } = JSON.parse(event.body);

    if (!hostPhone || !vehicleMakeModel) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Twilio configuration (from environment variables)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioPhone) {
      console.warn('Twilio not configured. SMS notification skipped.');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          ok: true, 
          message: 'SMS not configured - notification skipped',
          notificationSent: false
        })
      };
    }

    // Initialize Twilio client
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);

    // Send SMS
    const message = `🚗 NEW BOOKING ALERT!\n\nYour vehicle "${vehicleMakeModel}" has been booked by ${customerName || 'a customer'}.\n\nBooking Date: ${bookingDate || 'Not specified'}\n\nPlease check your host dashboard for details.\n\n- Clydero Cash Car Rental`;

    const response = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: hostPhone
    });

    console.log('SMS sent successfully:', response.sid);

    // Log notification to Firestore
    if (hostEmail) {
      try {
        await admin.firestore().collection('notifications').add({
          type: 'booking_sms',
          hostEmail,
          hostPhone,
          vehicleMakeModel,
          customerName,
          bookingDate,
          smsSid: response.sid,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent'
        });
      } catch (logError) {
        console.error('Failed to log notification:', logError);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        message: 'SMS notification sent',
        notificationSent: true,
        sid: response.sid
      })
    };

  } catch (error) {
    console.error('SMS notification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to send SMS notification',
        details: error.message 
      })
    };
  }
};
