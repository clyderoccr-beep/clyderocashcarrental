# Profile Media Upload & Persistence Fix

## Current Status
- ✅ Firestore rules deployed (users can create/update own docs)
- ✅ Client SDK configured with `clyderocashcarrental.appspot.com`
- ✅ Serverless upload function ready
- ✅ `ensureUserDocExists` creates user doc before saving photoUrl/coverUrl
- ✅ Realtime `onSnapshot` listener for auto-refresh
- ⚠️ CORS not yet applied (blocking direct client Storage SDK calls)

## Why Photos Disappear After Refresh

The upload succeeds via serverless function, but:
1. Client SDK tries to read the image URL → blocked by CORS
2. Or the Firestore `users/{uid}` doc write fails silently → nothing persists

**Solution**: Apply Storage CORS once using your owner Google account.

## Steps to Complete (One-Time Setup)

### 1. Add Netlify Environment Variable
In Netlify → Site settings → Build & deploy → Environment → Edit variables:
- **Add new var**: `FIREBASE_ADMIN_STORAGE_BUCKET` = `clyderocashcarrental.appspot.com`
- Keep existing `FIREBASE_STORAGE_BUCKET` = `clyderocashcarrental.firebasestorage.app` (for client SDK)
- Keep all other `FIREBASE_*` and `STORAGE_CORS_SECRET` as-is
- Save

### 2. Apply Storage CORS via Google Cloud Console (Easiest)
1. Go to [Google Cloud Console - Storage Browser](https://console.cloud.google.com/storage/browser?project=clyderocashcarrental)
2. Click on bucket `clyderocashcarrental.appspot.com`
3. Click "Permissions" tab
4. Scroll to "CORS" section, click "Edit"
5. Add this JSON:
```json
[
  {
    "origin": ["https://clyderoccr.com", "https://www.clyderoccr.com"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "responseHeader": ["Content-Type", "Authorization", "X-Goog-Algorithm", "X-Goog-Credential", "X-Goog-Date", "X-Goog-Expires", "X-Goog-SignedHeaders", "X-Goog-Signature", "Range"],
    "maxAgeSeconds": 3600
  }
]
```
6. Save

**OR via gsutil command line** (if you prefer):
```powershell
gcloud auth login
gcloud config set project clyderocashcarrental
gsutil cors set "c:\Users\DELL\Downloads\MY WEBSIDE CAR RENTAL\storage-cors.json" gs://clyderocashcarrental.appspot.com
gsutil cors get gs://clyderocashcarrental.appspot.com
```

### 3. Test
1. Hard refresh site (Ctrl+Shift+R)
2. Log out and log back in
3. Upload avatar and cover photo
4. Refresh page → photos should persist
5. Upload again → UI should update immediately (realtime listener)

## What Each Env Var Does

- `FIREBASE_STORAGE_BUCKET` (client SDK in index.html): tells browser where to upload/read
- `FIREBASE_ADMIN_STORAGE_BUCKET` (server functions): tells Admin SDK which GCS bucket to use for metadata operations
- You can keep both! Client uses the firebasestorage.app domain for user-friendly URLs; Admin uses appspot.com for GCS API access.

## Current Architecture

### Upload Flow
1. User selects photo → `handleAvatarFile` / `handleCoverFile`
2. Try serverless upload via `/.netlify/functions/upload-profile-media` (bypasses CORS/App Check)
3. Fallback to direct Storage SDK if serverless fails
4. `ensureUserDocExists(uid, email)` → creates `users/{uid}` if missing (via client or server)
5. `setDoc(merge:true)` → saves `photoUrl` / `coverUrl` to Firestore
6. Update localStorage cache
7. Render UI immediately

### Persistence & Realtime
- `renderAccountSummary()`: reads from localStorage first (optimistic), then Firestore
- `startUserDocRealtime()`: `onSnapshot` on `users/{uid}` → auto-updates UI when doc changes
- `stopUserDocRealtime()`: cleanup on logout

## Troubleshooting

### Photos still disappear
- Check browser console for "Missing or insufficient permissions" → Firestore rules issue (should be fixed now)
- Check for CORS errors → CORS not yet applied to Storage bucket
- Check Network tab: does `users/{uid}` doc have `photoUrl` / `coverUrl` fields after upload?

### "Bucket does not exist" error in functions
- Ensure `FIREBASE_ADMIN_STORAGE_BUCKET` env var is set in Netlify
- Trigger a new deploy after adding the env var
- Verify via `/.netlify/functions/test-admin` → should show bucket name

### Still can't apply CORS via function
- The Firebase service account may lack Storage Admin role
- **Easiest fix**: Use Google Cloud Console UI (step 2 above) or `gsutil` with your owner account

## Next Steps After CORS Applied
- Re-enable Firebase App Check for production security
- Consider signed URLs for profile media if you want private images
- Add image compression/resize before upload for faster load times

---
**Last Updated**: 2025-12-01
