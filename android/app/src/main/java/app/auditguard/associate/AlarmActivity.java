package app.auditguard.associate;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Full-screen "New work allocated" alarm screen, shown over the lock screen via the
 * alarm notification's full-screen intent. Rings (through {@link AlarmService}) until
 * the associate taps "Silence", which stops the service and opens the app.
 */
public class AlarmActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Show over the lock screen and turn the screen on.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }

        setContentView(R.layout.activity_alarm);

        String title = getIntent().getStringExtra(AlarmService.EXTRA_TITLE);
        String body = getIntent().getStringExtra(AlarmService.EXTRA_BODY);

        TextView titleView = findViewById(R.id.alarm_title);
        TextView bodyView = findViewById(R.id.alarm_body);
        if (title != null) titleView.setText(title);
        if (body != null) bodyView.setText(body);

        Button silence = findViewById(R.id.alarm_silence);
        silence.setOnClickListener(v -> silenceAndOpen());
    }

    private void silenceAndOpen() {
        // Stop the ringing.
        Intent stop = new Intent(this, AlarmService.class).setAction(AlarmService.ACTION_STOP);
        startService(stop);

        // Open the app (the WebView loads /mis).
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(open);

        finish();
    }

    @Override
    public void onBackPressed() {
        // Don't let Back dismiss the alarm without silencing it.
        silenceAndOpen();
    }
}
