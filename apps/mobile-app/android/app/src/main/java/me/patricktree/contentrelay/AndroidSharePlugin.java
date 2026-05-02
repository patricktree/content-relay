package me.patricktree.contentrelay;

import android.content.Intent;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.UUID;
import org.json.JSONObject;

@CapacitorPlugin(name = "AndroidShare")
public class AndroidSharePlugin extends Plugin {
    private static final String SHARE_INTENT_RECEIVED_EVENT = "shareIntentReceived";

    @Nullable
    private JSObject pendingShare;

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        JSObject response = new JSObject();

        if (pendingShare == null) {
            response.put("share", JSONObject.NULL);
        } else {
            response.put("share", pendingShare);
        }

        pendingShare = null;
        call.resolve(response);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        JSObject sharedText = parseSharedText(intent);

        if (sharedText == null) {
            return;
        }

        pendingShare = sharedText;
        notifyListeners(SHARE_INTENT_RECEIVED_EVENT, sharedText);
    }

    @Nullable
    private JSObject parseSharedText(@Nullable Intent intent) {
        if (intent == null) {
            return null;
        }

        if (!Intent.ACTION_SEND.equals(intent.getAction())) {
            return null;
        }

        String mimeType = intent.getType();

        if (mimeType == null || !mimeType.startsWith("text/")) {
            return null;
        }

        CharSequence extraText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);

        if (extraText == null) {
            return null;
        }

        String text = extraText.toString().trim();

        if (text.isEmpty()) {
            return null;
        }

        JSObject share = new JSObject();
        share.put("shareId", UUID.randomUUID().toString());
        share.put("text", text);

        String title = readOptionalTitle(intent);

        if (title != null) {
            share.put("title", title);
        }

        return share;
    }

    @Nullable
    private String readOptionalTitle(Intent intent) {
        String subject = readOptionalTrimmedText(intent, Intent.EXTRA_SUBJECT);

        if (subject != null) {
            return subject;
        }

        return readOptionalTrimmedText(intent, Intent.EXTRA_TITLE);
    }

    @Nullable
    private String readOptionalTrimmedText(Intent intent, String key) {
        CharSequence extraValue = intent.getCharSequenceExtra(key);

        if (extraValue == null) {
            return null;
        }

        String trimmedValue = extraValue.toString().trim();

        if (trimmedValue.isEmpty()) {
            return null;
        }

        return trimmedValue;
    }
}
