## Storage CORS Configuration (Serverless Method)
<!-- deploy ping 2025-12-01T00:01:30Z -->

You can apply CORS to the Firebase Storage bucket without installing `gsutil` by using the Netlify function `set-storage-cors` added in `netlify/functions/set-storage-cors.js`.

1. Set the following environment variables in Netlify:
	- `FIREBASE_STORAGE_BUCKET` = `clyderocashcarrental.firebasestorage.app`
	- `STORAGE_CORS_SECRET` = a long random string (e.g. generate via an online generator)
	- (Optional) `STORAGE_ALLOWED_ORIGINS` = `https://clyderoccr.com,https://www.clyderoccr.com`
2. Deploy.
3. From a local terminal, run:
	```powershell
	Invoke-RestMethod -Uri "https://clyderoccr.com/.netlify/functions/set-storage-cors" -Method POST -Headers @{ Authorization = "Bearer YOUR_SECRET" }
	```
4. Response `{ ok: true, applied: [...] }` indicates success. Propagation may take several minutes.

This replaces manual `gsutil cors set` usage.

## Base64 Private Key Helper

Generate `FIREBASE_PRIVATE_KEY_BASE64` from service account JSON:
```powershell
$jsonPath = "C:\Users\DELL\Downloads\clyderocashcarrental-firebase-adminsdk-fbsvc-11d591ddef.json"
$privateKey = (Get-Content $jsonPath -Raw | ConvertFrom-Json).private_key
Set-Content "C:\Users\DELL\Downloads\firebase_private_key.pem" $privateKey
$bytes = [System.Text.Encoding]::UTF8.GetBytes((Get-Content "C:\Users\DELL\Downloads\firebase_private_key.pem" -Raw))
[Convert]::ToBase64String($bytes)
```
Copy output into Netlify env var `FIREBASE_PRIVATE_KEY_BASE64`.

# Clydero Cash Car Rental (Fresh Scaffold)

Minimal, clean starting point with:
- Per-tab routing (Vehicles, About, Login, Membership, Sign Up)
- Christmas banner + gentle snow effect
- Vehicles grid seeded with 2014 Dodge Journey
- Blank default page (nothing shown until tab click)

## Run
Open `index.html` in a browser.

## Structure
- `index.html` — UI scaffold + styles
- `script.js` — Router and vehicles rendering
- `assets/` — Place images and icons here (optional)

## Next
- Add real vehicle photos and details
- Add Payments/Booking/Admin tabs
- Integrate Firebase Auth/Firestore if needed
Auto-deploy test 2025-11-28 14:51:14

Deploy test 2025-11-28 14:55:16

Auto-deploy verification 2025-11-28 14:56:34
