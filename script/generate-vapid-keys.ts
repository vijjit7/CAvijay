// Generate a VAPID key pair for Web Push. Run once:
//
//   npx tsx script/generate-vapid-keys.ts
//
// Copy the output into your environment (Railway/Render/.env):
//
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_SUBJECT=mailto:you@yourdomain.com   (optional; defaults to a mailto)
//
// Keep the private key secret. The public key is safe to ship to the browser — the
// client fetches it from /api/push/vapid-public-key when subscribing.

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("VAPID_PUBLIC_KEY=" + publicKey);
console.log("VAPID_PRIVATE_KEY=" + privateKey);
