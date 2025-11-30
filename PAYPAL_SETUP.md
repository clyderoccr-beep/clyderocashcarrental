# PayPal Integration Setup Guide

This project now includes callable Firebase Functions for PayPal Orders:
- `createPaypalOrder` – creates a PayPal order (sandbox) for a booking
- `capturePaypalOrder` – captures an approved PayPal order and updates the booking document

## 1. Create / Configure PayPal App
1. Go to https://developer.paypal.com/dashboard/applications
2. Create a Sandbox app (or use existing)
3. Note the `Client ID` and `Secret` for the Sandbox environment.

## 2. Set Firebase Function Secrets
Run in PowerShell (paste when prompted):
```powershell
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_CLIENT_SECRET
```
Then deploy:
```powershell
firebase deploy --only functions
```

## 3. Add PayPal SDK Script (Already Added)
In `index.html`:
```html
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_PAYPAL_CLIENT_ID&currency=USD" defer></script>
```
Replace `YOUR_PAYPAL_CLIENT_ID` with your actual sandbox client id.

## 4. Frontend Flow
When user clicks PayPal button:
1. `createOrder` calls Firebase callable `createPaypalOrder` with amount + bookingId.
2. Pop-up opens for user to approve payment.
3. `onApprove` calls `capturePaypalOrder` which:
   - Captures the PayPal order
   - Updates Firestore booking with:
     - `lastPaypalOrderId`
     - `lastPaypalCaptureId`
     - `lastPaypalStatus`
     - `lastPaypalAmount`
     - `lastPaymentAt`
     - `status` (accepted unless already rented)

## 5. Amount Handling
We send amount in cents from frontend: `Math.round(amount * 100)`.
Backend converts to PayPal decimal via `(amount/100).toFixed(2)`.

## 6. Extension Support
Currently PayPal flow treats extension same as initial payment; if you want separate logic, create a bookingId suffix (e.g. `bookingId+'_extend1w'`) similar to Stripe.

## 7. Moving to Live
1. Repeat steps using **Live** app credentials.
2. Update script tag to point to live client id.
3. Ensure currency and compliance requirements are satisfied.
4. Switch API base from sandbox `api-m.sandbox.paypal.com` to live `api-m.paypal.com` (update functions when ready).

## 8. Production Hardening
| Item | Recommendation |
|------|---------------|
| Order validation | Store order amount before creation, compare after capture |
| Duplicate capture | Check if `lastPaypalCaptureId` already exists before updating |
| Logging | Add structured logs for audit trail |
| Error alerts | Integrate monitoring (e.g. Google Cloud Logging alerts) |
| Refunds | Implement a callable to issue refunds via Orders API |

## 9. Refunds (Future)
Refund needs PayPal Capture ID. Endpoint:
```
POST /v2/payments/captures/{capture_id}/refund
```
Add secret retrieval + call inside a new callable function.

## 10. Testing Cards
Use Sandbox buyer account credentials (create in PayPal dashboard under Sandbox > Accounts). Log in during approval popup.

## 11. Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| `PayPal SDK not loaded` | Missing or wrong client-id | Replace placeholder with real sandbox client-id |
| `Create failed` | Secrets missing | Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET then redeploy |
| Approval popup closes instantly | Order id empty | Ensure bookingId and amount are filled |
| Capture fails 401 | Invalid or expired access token | Re-check client id/secret and redeploy |

## 12. Security Notes
- Never expose `PAYPAL_CLIENT_SECRET` in frontend.
- All capture and order logic should remain server-side (callables are OK).
- Consider rate limiting to prevent abuse.

## 13. Next Enhancements
- Distinguish extension vs initial payments in PayPal metadata.
- Add webhook listener for PayPal (IPN / Webhooks) for more robust reconciliation.
- Merge unified payment history list per booking.

---
Need help enabling live mode or adding refunds? Ask and I can scaffold it.
