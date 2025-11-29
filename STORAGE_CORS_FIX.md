# Firebase Storage CORS Configuration

## Problem
The browser console shows CORS errors when trying to upload images to Firebase Storage:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' has been blocked by CORS policy
```

## Solution
You need to configure CORS (Cross-Origin Resource Sharing) for your Firebase Storage bucket.

## Steps to Fix

### Option 1: Using Google Cloud Console (Recommended)

1. **Install Google Cloud SDK** (if not already installed):
   - Download from: https://cloud.google.com/sdk/docs/install
   - Or use the web-based Cloud Shell at: https://console.cloud.google.com/

2. **Apply CORS configuration**:
   ```bash
   gsutil cors set storage-cors.json gs://clyderocashcarrental.firebasestorage.app
   ```

3. **Verify CORS configuration**:
   ```bash
   gsutil cors get gs://clyderocashcarrental.firebasestorage.app
   ```

### Option 2: Using Firebase Console

1. Go to https://console.firebase.google.com/
2. Select your project: `clyderocashcarrental`
3. Click "Storage" in the left menu
4. Click on the "Rules" tab
5. Update your storage rules to allow uploads:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /vehicle_images/{imageId} {
      // Allow authenticated users to read
      allow read: if true;
      // Allow only owner to write
      allow write: if request.auth != null && request.auth.token.email == 'clyderofraser97@gmail.com';
    }
  }
}
```

### Option 3: Quick Test with Localhost

If you're testing locally, you can temporarily use a more permissive CORS policy:

1. Open Firebase Console > Storage
2. Make sure your bucket exists: `clyderocashcarrental.firebasestorage.app`
3. The CORS configuration in `storage-cors.json` allows all origins (`"*"`), which is fine for testing

## Alternative: Use Base64 Images Instead

If you can't configure CORS immediately, the code already has a fallback to base64 images. However, this is not recommended for production because:
- Base64 increases file size by ~33%
- Firestore documents have a 1MB limit
- Images aren't cached efficiently

## After Applying CORS

1. Refresh your browser (hard refresh: Ctrl+Shift+R)
2. Try uploading an image again
3. Check the console - CORS errors should be gone
4. Images should upload successfully to Firebase Storage

## Check Current Storage Rules

1. Firebase Console > Storage > Rules tab
2. Make sure the rules allow writes for the owner email
3. Example secure rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && 
                     request.auth.token.email == 'clyderofraser97@gmail.com';
    }
  }
}
```

## Troubleshooting

- **Error persists**: Clear browser cache and cookies
- **"Bucket doesn't exist"**: Check the bucket name in Firebase Console
- **Upload still fails**: Check that you're logged in as `clyderofraser97@gmail.com`
- **Permission denied**: Verify Storage Rules allow write access for your email
