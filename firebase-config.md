# Firebase Configuration Setup

Your site now has Firestore persistence! All vehicle edits and About page changes will be saved to your Firebase database.

## Setup Instructions

1. **Go to Firebase Console**: https://console.firebase.google.com/

2. **Create a new project** (or use existing one):
   - Click "Add project"
   - Enter project name (e.g., "clydero-car-rental")
   - Disable Google Analytics (optional)
   - Click "Create project"

3. **Enable Firestore Database**:
   - In the left menu, click "Firestore Database"
   - Click "Create database"
   - Choose "Start in test mode" (we'll update rules later)
   - Select your preferred location
   - Click "Enable"

4. **Get your Firebase config**:
   - Click the gear icon next to "Project Overview"
   - Click "Project settings"
   - Scroll down to "Your apps"
   - Click the web icon (</>)
   - Register your app (name: "Clydero Car Rental")
   - Copy the `firebaseConfig` object

5. **Update index.html**:
   - Open `index.html`
   - Find the Firebase configuration section (around line 643)
   - Replace the placeholder values with your actual config:
     ```javascript
     const firebaseConfig = {
       apiKey: "YOUR_ACTUAL_API_KEY",
       authDomain: "your-project.firebaseapp.com",
       projectId: "your-project-id",
       storageBucket: "your-project.appspot.com",
       messagingSenderId: "123456789",
       appId: "1:123456789:web:abcdef123456"
     };
     ```

6. **Update Firestore Security Rules**:
   - In Firebase Console, go to "Firestore Database" → "Rules"
   - Replace with the content from `firestore.rules` file in this folder
   - Click "Publish"

## What Gets Saved

### Vehicles Collection (`vehicles/`)
Each vehicle is saved with:
- `id`: Unique identifier
- `name`: Vehicle name
- `type`: Vehicle type (SUV, Sedan, etc.)
- `seats`: Number of seats
- `price`: Weekly rental price
- `imgs`: Array of image URLs or base64 data
- `available`: Boolean availability status
- `details`: Additional description

### About Content (`site_content/about`)
- `title`: About page title
- `content`: About page content text

## How It Works

- **On page load**: Data is fetched from Firestore
- **When you edit**: Changes save automatically to Firestore
- **Add vehicle**: Immediately saved
- **Edit vehicle**: Saved when you click "Save"
- **Toggle availability**: Saved instantly
- **Delete vehicle**: Removed from Firestore
- **Edit About**: Saved when you click "Save"

## Testing

1. Open your site in a browser
2. Log in as owner (clyderofraser97@gmail.com)
3. Go to Admin tab
4. Make changes (edit vehicle, toggle availability, edit About)
5. Refresh the page - your changes should persist!

## Troubleshooting

- **Check browser console** (F12) for error messages
- **Verify Firebase config** is correct in `index.html`
- **Check Firestore rules** allow read/write access
- **Test mode rules** (temporary for setup):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
  ```

## Next Steps

- Update firestore.rules with proper owner authentication
- Consider using Firebase Storage for vehicle images instead of base64
- Add Firebase Authentication for real user login
