# Apple Pay Domain Verification Guide

Apple Pay requires domain verification before the payment request (Apple Pay) button appears on Safari (macOS / iOS).

## 1. Requirements
- Live HTTPS domain (custom domain or Netlify site)
- Stripe account with Apple Pay enabled
- Ability to upload a file to `/.well-known/`

## 2. Enable Apple Pay in Stripe
1. Log in: https://dashboard.stripe.com
2. Go to Settings > Payment Methods
3. Find Apple Pay and click Enable (if not already)
4. Click **Add new domain**
5. Enter your domain (e.g. `example.com` or `clyderoccr.netlify.app`)
6. Stripe will give you a file: `apple-developer-merchantid-domain-association`

## 3. Add Verification File to Your Site
Create the folder structure in your project root:
```
.well-known/
  apple-developer-merchantid-domain-association
```
Place the provided file there unmodified.

If you deploy via Netlify:
- Ensure the directory `.well-known` is included (Netlify will publish it)
- After deploy visit: `https://your-domain/.well-known/apple-developer-merchantid-domain-association`
- It must return the raw file contents (no 404, no HTML wrapper)

## 4. Re-Verify in Stripe
After the file is accessible, click Verify in Stripe.
Status should change to Verified.

## 5. Test Apple Pay
- Use Safari on macOS or iOS
- Device must have at least one active card in Apple Wallet
- Navigate to Payments tab
- Apple Pay button appears if `paymentRequest.canMakePayment()` returns truthy.

## 6. Common Issues
| Issue | Cause | Fix |
|-------|-------|-----|
| Button not showing | Not Safari / unsupported browser | Use Safari on macOS/iOS |
| Still not showing | Domain not verified | Re-check file accessible over HTTPS |
| Shows but payment fails | Using live wallet with test keys | Switch Stripe keys to live or use test Apple Pay sandbox device |
| Verification fails | File contents modified or wrong path | Re-download and place exactly at `/.well-known/` |

## 7. Sandbox Testing Tips
Apple Pay sandbox uses real Wallet but test Stripe keys. For full end-to-end test you can switch to live later; never mix test keys with production wallet charges.

## 8. After Success
No further action needed. Stripe handles tokenization; backend `createPaymentIntent` already supports card-based methods (Apple Pay tokens appear as card source).

## 9. Troubleshooting Checklist
- [ ] Stripe Apple Pay enabled
- [ ] Domain added & verified
- [ ] File at correct path
- [ ] Safari used for testing
- [ ] Wallet has a valid card
- [ ] Using test or live keys consistently

## 10. Security Note
Do not modify the association file. Treat it like a certificate stub.

---
Need help verifying a specific domain? Provide the domain and I can give a curl command to validate its served contents.
