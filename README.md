# LifeLog Android — Native Productivity App

LifeLog Android is a high-performance, private, local-first second brain packaged for Android via **Capacitor 7**.

## ✨ Features
- **Thumb-Friendly Bottom Navigation**: Today, Tasks, Elevated Center FAB (`+`), Focus, and LifeLog Hub sheet.
- **Tactile Physical Haptics**: Native vibration feedback on task completions, live drag-and-slide reordering, and timers.
- **Android Hardware Back Button**: Closes dialogs/sheets first, navigates to Today, or minimizes app.
- **AES-GCM Encryption**: Secure local storage inside Android's private app sandbox.
- **Automated Rolling Backups**: Zero external servers required.

## 🚀 How to Build APK with GitHub Actions (Zero Setup)

1. Create a new GitHub repository at https://github.com/new
2. Connect your local folder and push:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
3. Go to the **Actions** tab on your GitHub repository.
4. The **Build LifeLog Android APK** workflow will compile the APK automatically.
5. Download **LifeLog-Debug-APK** (`app-debug.apk`) directly from the Artifacts section!
