package me.patricktree.contentrelay;

import android.content.Intent;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class ShareActivity extends BridgeActivity {
    private static final int HORIZONTAL_WINDOW_MARGIN_DP = 18;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidSharePlugin.class);
        configureOverlayWindowSize();
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
    }

    private void configureOverlayWindowSize() {
        DisplayMetrics displayMetrics = getResources().getDisplayMetrics();
        int horizontalMarginPixels = Math.round(HORIZONTAL_WINDOW_MARGIN_DP * displayMetrics.density);
        int dialogWidth = displayMetrics.widthPixels - horizontalMarginPixels * 2;

        getWindow().setLayout(dialogWidth, WindowManager.LayoutParams.WRAP_CONTENT);
    }
}
