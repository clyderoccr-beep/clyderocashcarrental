# License Photo System - Technical Documentation

## ✅ CURRENT WORKING IMPLEMENTATION (DO NOT CHANGE)

### System Overview
The license photo upload system works with the following flow:

1. **Signup Form**: User selects photo via file input `#licensePhoto`
2. **Photo Capture**: File and base64 data stored in globals `LICENSE_PHOTO_FILE` and `LICENSE_PHOTO_DATA`
3. **Account Creation**: Firebase Auth creates user account
4. **Photo Processing**: 
   - Photo captured BEFORE clearing globals
   - Fallback reads file if base64 not ready
   - Photo compressed to max 800x800 at 0.7 JPEG quality
   - Uploaded to Firebase Storage at `license_photos/{email}_{timestamp}.jpg`
5. **Firestore Save**: Only Storage URL saved to `licensePhotoUrl` field (NOT base64 data)
6. **Member View**: Admin sees photo from `licensePhotoUrl`

### Critical Implementation Details

#### ✅ What Works
- **Storage URL only**: Only `licensePhotoUrl` saved to Firestore (no `licensePhotoData`)
- **Reason**: Firestore has 1MB field limit; base64 photos exceed this
- **Compression**: Photos compressed before upload to ~100-200KB
- **Fallback**: If FileReader hasn't completed, file is read synchronously during signup
- **Async/Await**: Signup waits for photo upload and Firestore save before redirecting
- **Loading States**: User sees "Creating account...", "Uploading photo...", "Finalizing..."

#### ❌ What Causes Conflicts
1. **Saving base64 to Firestore**: Causes "field longer than 1048487 bytes" error
2. **Background async save**: Causes "No membership profile found" on login
3. **Clearing globals before capture**: Results in empty photo data
4. **Missing Storage rules**: Blocks uploads with permission denied

### Firebase Storage Rules
```javascript
match /license_photos/{allPaths=**} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid != null;
}
```

### File Structure
- `script.js` lines ~1710-1730: Photo input change handler
- `script.js` lines ~1774-1900: Signup handler with photo upload
- `script.js` lines ~2380-2480: Member view with photo display
- `script.js` lines ~850-870: Update Info modal photo preview
- `index.html` line 1148: Signup form license photo input
- `index.html` line 675: Update Info modal photo input

### Key Code Patterns

#### Photo Capture (Correct)
```javascript
let capturedPhotoFile = LICENSE_PHOTO_FILE;
let capturedPhotoData = LICENSE_PHOTO_DATA;

// Fallback if FileReader too slow
if (capturedPhotoFile && !capturedPhotoData) {
  capturedPhotoData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(capturedPhotoFile);
  });
}
```

#### Photo Upload (Correct)
```javascript
// Compress to 800x800 at 0.7 quality
fileToUpload = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX = 800;
      if (width > height) {
        if (width > MAX) { height *= (MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width *= (MAX / height); height = MAX; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Compression failed'));
      }, 'image/jpeg', 0.7);
    };
    img.onerror = reject;
    img.src = ev.target.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(sourceFile);
});

await uploadBytes(ref, fileToUpload);
photoUrl = await getDownloadURL(ref);
```

#### Firestore Save (Correct)
```javascript
// ONLY save URL, NOT base64 data
const profileData = { ...basePayload, licensePhotoUrl: photoUrl };
await setDoc(doc(db, 'users', uid), profileData);
```

#### Member View (Correct)
```javascript
// Check for licensePhotoUrl only (no licensePhotoData)
const hasLicense = !!u.licensePhotoUrl;
const photoUrl = u.licensePhotoUrl || u.photoUrl || '';
```

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "field longer than 1048487 bytes" | Saving base64 to Firestore | Only save Storage URL |
| "No membership profile found" | Background save not complete | Await profile save before redirect |
| licensePhotoUrl: NONE | Storage rules missing | Add license_photos rule |
| Empty photo data | Globals cleared too early | Capture before clearing |
| Photo not showing | Checking licensePhotoData | Check licensePhotoUrl only |

### Testing Checklist
- [ ] Signup with live photo on mobile
- [ ] Photo appears in Admin → Members view
- [ ] Photo size < 200KB in Storage
- [ ] Firestore has licensePhotoUrl (HTTPS URL)
- [ ] Firestore does NOT have licensePhotoData
- [ ] No "field too large" errors
- [ ] No "profile not found" errors
- [ ] Login works immediately after signup

### Last Updated
December 3, 2025 - System verified working

### DO NOT MODIFY
- Photo compression logic
- Storage upload flow
- Firestore field structure (licensePhotoUrl only)
- Global variable capture timing
- Async/await structure in signup
