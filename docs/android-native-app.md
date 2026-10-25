# AuditGuard native Android app

The native app is a **Capacitor** shell around the live web app. It loads
`https://cavijay-production.up.railway.app` in a WebView (so there's one codebase and web
changes ship without rebuilding the APK) and adds the piece a PWA cannot do: a **loud,
looping alarm + continuous vibration that rings over the lock screen when new work is
allocated, even when the app is closed, until the associate silences it.**

## How it works

```
New MIS case allocated
   → server notifyAssociateNewWork()
       → web rows  : Web Push (VAPID)  → PWA notification (unchanged)
       → android rows: FCM data message → AlarmMessagingService (native)
                           → AlarmService: looping alarm ringtone (alarm stream)
                                           + continuous vibration
                                           + full-screen AlarmActivity over lock screen
                           → associate taps "Silence" → stops + opens /mis
```

- Native device tokens are stored in the existing `push_subscriptions` table with
  `platform = 'android'` (web rows stay `'web'`). The server fan-out dispatches per
  platform; the distance ("~X km away") logic is shared.
- The app registers its FCM token on launch/resume (`/api/push/register-native`),
  authenticated by the WebView's session cookie, and reports its last-known location
  (`/api/push/location`) for the distance hint.
- Permissions requested at first launch: notifications (Android 13+) and location.

Key files: `capacitor.config.ts`, `android/app/src/main/java/app/auditguard/associate/*`
(`MainActivity`, `AlarmMessagingService`, `AlarmService`, `AlarmActivity`),
`server/fcm.ts`, `server/push.ts`.

## One-time setup

### 1. Firebase project (for FCM)
1. Go to the [Firebase console](https://console.firebase.google.com/) → **Add project**.
2. In the project, **Add app → Android**. Package name: **`app.auditguard.associate`**.
3. Download **`google-services.json`** and put it at **`android/app/google-services.json`**.
4. Project settings → **Service accounts** → **Generate new private key**. This downloads a
   service-account JSON — this is the server credential (next step). Keep it secret.

### 2. Server env vars (Railway)
- **`FIREBASE_SERVICE_ACCOUNT`** = the full contents of the service-account JSON from step 4
  (paste the whole JSON as the value). Without it, native push is a safe no-op.
- **`GOOGLE_MAPS_API_KEY`** — already needed for the distance line; confirm it's set.

The server auto-adds the `platform` column on boot (see `server/db.ts` `ensureSchema`), so
no manual migration is required.

## Build the APK (needs Android Studio / Android SDK)

From the repo root on a machine with Android Studio installed:

```bash
npm install
npx cap sync android          # regenerates ignored Capacitor files + copies config
```

Then either:

**Android Studio (recommended):**
1. Open the `android/` folder in Android Studio.
2. Make sure `android/app/google-services.json` is present.
3. Build → **Build Bundle(s) / APK(s) → Build APK(s)**, or press Run with a device attached.

**Command line:**
```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
# release build needs a signing keystore configured
```

Sideload `app-debug.apk` onto the phone (enable "Install unknown apps" for the file
manager/browser).

## Test end-to-end
1. Open the app, log in as an associate, **grant** the notification + location prompts.
2. From the admin MIS page, use **Send notification** on one of that associate's cases
   (or allocate real new work).
3. The phone should ring the looping alarm + vibrate and show the full-screen alert —
   even locked / with the app closed — until **Silence** is tapped.

## Device notes (Android OEM quirks)
- **Android 14+**: the app declares `USE_FULL_SCREEN_INTENT`. If a full-screen alarm ever
  shows only as a heads-up notification, grant "full screen intents"/"alarms" for the app
  in Settings.
- **Xiaomi/Redmi, Realme, Oppo/Vivo, Samsung**: turn **off battery optimization** and
  enable **Autostart** for AuditGuard, or the OS can delay/kill background FCM delivery.
- Make sure the app's notification category isn't set to silent.
