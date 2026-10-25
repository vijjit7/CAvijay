package app.auditguard.associate;

import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.RemoteMessage;

/**
 * Receives FCM messages. Extends the Capacitor push plugin's service so the normal
 * JS bridge (token + message events to the WebView) still works when the app is
 * running, and ADDS the native "new work" alarm: when a data message with
 * type=new-work arrives — even if the app is killed or the phone is locked — we start
 * {@link AlarmService}, which rings a looping alarm + vibrates and raises a
 * full-screen alert until the associate silences it.
 *
 * Replaces the plugin's own MessagingService (removed in AndroidManifest via
 * tools:node="remove") so there's exactly one FCM service.
 */
public class AlarmMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Keep the plugin's behaviour (delivers to JS if the WebView is alive).
        super.onMessageReceived(remoteMessage);

        String type = remoteMessage.getData().get("type");
        if (!"new-work".equals(type)) {
            return;
        }

        String title = remoteMessage.getData().get("title");
        String body = remoteMessage.getData().get("body");

        Intent intent = new Intent(this, AlarmService.class);
        intent.setAction(AlarmService.ACTION_START);
        intent.putExtra(AlarmService.EXTRA_TITLE, title != null ? title : "New work allocated");
        intent.putExtra(AlarmService.EXTRA_BODY, body != null ? body : "A new case is in your intray.");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }
}
