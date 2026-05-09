package me.patricktree.contentrelay;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidSharePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // With singleTask launch mode, Android delivers repeat share actions to the existing
        // activity instead of creating a new one. Keep the current intent fresh so Capacitor
        // can forward the latest shared text to AndroidSharePlugin.
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
