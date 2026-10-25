import type { CapacitorConfig } from "@capacitor/cli";

// The native Android app is a thin shell around the live web app: it loads the
// deployed site directly (server.url), so there's a single codebase and web changes
// ship without rebuilding the APK. The custom native alarm (loud ringtone + vibration
// + full-screen lock-screen alert on new work) lives in android/ and is driven by FCM
// data messages — see android/app/src/main/java/.../AlarmService + MessagingService.
const config: CapacitorConfig = {
  appId: "app.auditguard.associate",
  appName: "AuditGuard",
  // Only used as a fallback bundle; the app actually loads server.url below.
  webDir: "android-webdir",
  server: {
    url: "https://cavijay-production.up.railway.app",
    // The site is HTTPS, so no cleartext is needed.
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      // We handle presentation natively (the alarm), so no auto-badging needed.
      presentationOptions: [],
    },
  },
};

export default config;
