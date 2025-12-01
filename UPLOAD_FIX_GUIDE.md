# Upload Fix Guide - Complete Setup

## Problem
Avatar and cover photo uploads fail with:
- `500 (Internal Server Error)` from Netlify function
- CORS errors blocking direct Firebase Storage access

## Root Causes
1. **Missing Firebase Admin credentials** in Netlify environment
2. **Storage CORS not configured** for https://clyderoccr.com

---

## Solution Steps

### Step 1: Get Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **clyderocashcarrental**
3. Click the **gear icon** ⚙️ (top left) → **Project settings**
4. Go to **Service accounts** tab
5. Click **Generate new private key**
6. Save the downloaded JSON file (keep it secure!)

---

### Step 2: Configure Netlify Environment Variables

1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Select your site: **clyderocashcarrental** (or whatever your site is named)
3. Go to **Site configuration** → **Environment variables**
4. Click **Add a variable** and create:

   **Variable name:** `FIREBASE_SERVICE_ACCOUNT_JSON`
   
   **Value:** Open the service account JSON file you downloaded in Step 1 and paste the **entire JSON content** (it should look like `{"type":"service_account","project_id":"clyderocashcarrental",...}`)
   
   **Scopes:** All scopes (or at least Functions)

5. Click **Save**

---

### Step 3: Fix Firebase Storage CORS

Open **PowerShell** and run these commands:

```powershell
# Create CORS configuration file
@'
[
  {
    "origin": ["https://clyderoccr.com"],
    "method": ["GET", "POST", "PUT", "HEAD", "DELETE", "OPTIONS"],
    "responseHeader": ["Content-Type", "Authorization", "x-goog-meta-firebaseStorageDownloadTokens", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
'@ | Set-Content -Path storage-cors-production.json -Encoding ascii

# Apply CORS to your Storage bucket
gsutil cors set storage-cors-production.json gs://clyderocashcarrental.appspot.com

# Verify CORS was applied
gsutil cors get gs://clyderocashcarrental.appspot.com
```

**Note:** If `gsutil` is not installed:
1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. Run `gcloud init` and login with your Firebase account (clyderoccr@gmail.com)
3. Run the commands above

---

### Step 4: Trigger Netlify Redeploy

After setting environment variables:

1. Go to **Netlify Dashboard** → Your site → **Deploys**
2. Click **Trigger deploy** → **Clear cache and deploy site**
3. Wait for the deploy to complete (~1-2 minutes)

---

### Step 5: Test Upload

1. Go to https://clyderoccr.com
2. Login to your account
3. Navigate to **My Account** (Membership page)
4. Click the small camera icon on avatar or cover
5. Upload an image

**Expected result:** Image uploads successfully and displays immediately.

---

## Troubleshooting

### If uploads still fail:

**Check Netlify Function Logs:**
1. Netlify Dashboard → Functions → `upload-profile-media`
2. Look for errors like "admin_init_failed" or token verification errors

**Check Browser Console:**
- Open DevTools (F12) → Console tab
- Look for the error message after attempting upload
- Share the first red error line if you need help

**Verify Environment Variables:**
- Netlify Dashboard → Environment variables
- Confirm `FIREBASE_SERVICE_ACCOUNT_JSON` exists and has valid JSON (starts with `{` and ends with `}`)

---

## Alternative: Use Individual Environment Variables

If pasting the full JSON is problematic, you can use discrete variables instead:

1. Open the service account JSON file
2. In Netlify, create these three variables:

   - `FIREBASE_PROJECT_ID` = value of `"project_id"` from JSON
   - `FIREBASE_CLIENT_EMAIL` = value of `"client_email"` from JSON
   - `FIREBASE_PRIVATE_KEY` = value of `"private_key"` from JSON (paste as-is with `\n` for newlines)

3. Redeploy

---

## Summary

✅ After completing all steps:
- Netlify functions can authenticate with Firebase Admin
- Browser can access Storage directly (CORS fixed)
- Uploads work via serverless function fallback
- Both avatar and cover photos upload successfully

Need help? Share the specific error message from console or Netlify function logs.
