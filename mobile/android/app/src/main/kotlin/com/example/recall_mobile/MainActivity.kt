package com.example.recall_mobile

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "recall/device_settings")
            .setMethodCallHandler { call, result ->
                if (call.method == "notifications") {
                    startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
                    result.success(null)
                } else if (call.method == "openUrl") {
                    val uri = Uri.parse(call.arguments as? String ?: "")
                    if (uri.scheme == "https" && uri.host in setOf("recall-six-azure.vercel.app", "recall.touchmarkdes.com")) {
                        try { startActivity(Intent(Intent.ACTION_VIEW, uri)); result.success(null) }
                        catch (_: Exception) { result.error("unavailable", "No browser available", null) }
                    } else result.error("invalid_url", "Only Recall HTTPS pages can be opened", null)
                } else result.notImplemented()
            }
    }
}
