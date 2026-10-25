package app.auditguard.associate;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * Hosts the Capacitor WebView (which loads the live site via server.url) and, on top of
 * the web app:
 *   • requests the phone permissions the app needs at launch — notifications
 *     (Android 13+) and location (for the "~X km away" distance hint); and
 *   • registers this device's FCM token with the server so new-work pushes can reach
 *     it. Association to the logged-in associate rides the WebView's session cookie.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "AuditGuard";
    private static final String BASE_URL = "https://cavijay-production.up.railway.app";
    private static final int PERM_REQUEST = 9001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestStartupPermissions();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Register (or refresh) the push token every time the app comes to the
        // foreground — by then the associate is usually logged in, so the session
        // cookie is available to tie the token to them. Safe to repeat.
        registerPushToken();
    }

    private void requestStartupPermissions() {
        List<String> needed = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERM_REQUEST);
        }
    }

    private void registerPushToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                Log.w(TAG, "FCM token unavailable", task.getException());
                return;
            }
            final String token = task.getResult();
            new Thread(() -> postTokenToServer(token)).start();
        });
    }

    private void postTokenToServer(String token) {
        HttpURLConnection conn = null;
        try {
            // The httpOnly session cookie lives in the WebView's cookie store; read it so
            // the server can map this token to the logged-in associate.
            String cookie = CookieManager.getInstance().getCookie(BASE_URL);
            if (cookie == null || cookie.isEmpty()) {
                Log.i(TAG, "No session cookie yet; will retry token registration on next resume");
                return;
            }

            URL url = new URL(BASE_URL + "/api/push/register-native");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Cookie", cookie);

            String payload = "{\"token\":" + jsonString(token) + ",\"platform\":\"android\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes("UTF-8"));
            }

            int code = conn.getResponseCode();
            Log.i(TAG, "register-native responded " + code);

            // Once the token is known, report this device's location (tied to the token)
            // so new-work pushes can include a "~X km away" distance.
            if (code >= 200 && code < 300) {
                reportLocation(token, cookie);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to register push token", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void reportLocation(String token, String cookie) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        HttpURLConnection conn = null;
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;

            Location best = null;
            for (String provider : lm.getProviders(true)) {
                Location loc = lm.getLastKnownLocation(provider);
                if (loc == null) continue;
                if (best == null || loc.getTime() > best.getTime()) best = loc;
            }
            if (best == null) return;

            URL url = new URL(BASE_URL + "/api/push/location");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Cookie", cookie);

            String payload = "{\"endpoint\":" + jsonString(token)
                + ",\"lat\":" + best.getLatitude()
                + ",\"lng\":" + best.getLongitude() + "}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes("UTF-8"));
            }
            Log.i(TAG, "push/location responded " + conn.getResponseCode());
        } catch (Exception e) {
            Log.w(TAG, "Failed to report location", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String jsonString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default: sb.append(c);
            }
        }
        return sb.append("\"").toString();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Nothing to do — the WebView picks up granted permissions (geolocation) and the
        // alarm uses granted notification access. We simply don't nag beyond the ask.
    }
}
