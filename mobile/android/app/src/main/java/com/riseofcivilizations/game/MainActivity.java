package com.riseofcivilizations.game;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 15+ (targetSdk 35): draw behind system bars and let the WebView
        // use CSS safe-area insets (viewport-fit=cover in index.html).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insets != null) {
            // Dark game chrome (#0f0e0b): use light status/navigation icons.
            insets.setAppearanceLightStatusBars(false);
            insets.setAppearanceLightNavigationBars(false);
        }
    }
}
