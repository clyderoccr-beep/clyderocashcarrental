# SMS Notification Setup for Clydero Cash Car Rental

This guide explains how to configure SMS notifications to alert hosts when their vehicles are booked.

## Prerequisites

1. A Twilio account (free trial available at https://www.twilio.com)
2. Netlify environment variables configured

## Step 1: Create Twilio Account

1. Go to https://www.twilio.com/try-twilio
2. Sign up for a free account
3. Verify your email and phone number
4. Complete the onboarding wizard

## Step 2: Get Twilio Credentials

1. From your Twilio Console Dashboard (https://console.twilio.com):
   - **Account SID**: Found on the main dashboard
   - **Auth Token**: Found on the main dashboard (click "Show" to reveal)
   - **Phone Number**: Get a free trial phone number from the "Phone Numbers" section

## Step 3: Configure Netlify Environment Variables

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Add the following variables:

```
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number_here (format: +1234567890)
```

4. Click **Save**
5. Redeploy your site for the changes to take effect

## Step 4: Install Dependencies

The Twilio npm package is already included in `netlify/functions/package.json`:

```json
{
  "dependencies": {
    "twilio": "^5.0.0"
  }
}
```

Netlify will automatically install this when deploying.

## Step 5: Test the SMS Function

### From the browser console:

```javascript
fetch('/.netlify/functions/send-sms-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hostEmail: 'host@example.com',
    hostPhone: '+1234567890',
    vehicleMakeModel: 'Toyota Camry 2020',
    customerName: 'John Doe',
    bookingDate: '2025-01-15'
  })
})
.then(res => res.json())
.then(data => console.log('SMS Response:', data));
```

## How It Works

1. **Customer books a vehicle** → `script.js` detects the booking
2. **Check if host vehicle** → Looks for `hostId` on the vehicle
3. **Get host phone** → Retrieves phone number from Firestore or localStorage
4. **Send SMS** → Calls `/.netlify/functions/send-sms-notification`
5. **Twilio sends text** → Host receives notification on their phone
6. **Log notification** → Record saved to Firestore `notifications` collection

## SMS Message Format

```
🚗 NEW BOOKING ALERT!

Your vehicle "Toyota Camry 2020" has been booked by John Doe.

Booking Date: 2025-01-15

Please check your host dashboard for details.

- Clydero Cash Car Rental
```

## Troubleshooting

### SMS not sending:
- Check Netlify environment variables are set correctly
- Verify Twilio phone number is active
- Check Netlify function logs for errors
- Ensure host phone number is in E.164 format (+1234567890)

### Free trial limitations:
- Twilio free trial can only send SMS to verified phone numbers
- Add host phone numbers to "Verified Caller IDs" in Twilio Console
- Upgrade to a paid account to send to any number

### Graceful fallback:
- If Twilio is not configured, the system continues to work
- SMS notification is skipped with a console warning
- No error shown to customers

## Firestore Notification Logs

All SMS notifications are logged to Firestore:

```javascript
{
  type: 'booking_sms',
  hostEmail: 'host@example.com',
  hostPhone: '+1234567890',
  vehicleMakeModel: 'Toyota Camry 2020',
  customerName: 'John Doe',
  bookingDate: '2025-01-15',
  smsSid: 'SM1234567890abcdef',
  sentAt: Timestamp,
  status: 'sent'
}
```

## Cost Estimation

Twilio SMS pricing (as of 2025):
- Domestic US SMS: ~$0.0079 per message
- With 100 bookings/month: ~$0.79/month
- Free trial includes $15 credit

## Next Steps

1. Consider adding SMS notifications for:
   - Booking accepted by admin
   - Booking canceled
   - Payment received
   - Return reminder (24 hours before)
   
2. Add email fallback if SMS fails
3. Allow hosts to configure notification preferences
4. Add WhatsApp integration (via Twilio)
