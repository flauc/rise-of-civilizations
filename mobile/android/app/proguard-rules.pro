# Rise of Civilizations — release (R8) keep rules for the Capacitor shell.

# Readable stack traces in mapping.txt / Play Console.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor core + plugin discovery.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin *;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep public class * extends com.getcapacitor.BridgeActivity { *; }

# App entry.
-keep public class com.riseofcivilizations.game.MainActivity { *; }

# Capacitor plugins shipped with this app.
-keep class com.capacitorjs.plugins.** { *; }

# WebView JS bridges (if any plugin exposes @JavascriptInterface).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX used by the shell.
-keep class androidx.appcompat.** { *; }
