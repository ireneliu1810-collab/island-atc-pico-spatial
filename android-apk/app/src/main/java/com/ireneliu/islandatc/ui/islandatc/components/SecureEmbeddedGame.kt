package com.ireneliu.islandatc.ui.islandatc.components

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import java.io.IOException

private const val APP_ASSET_HOST = "appassets.androidplatform.net"
private const val APP_ASSET_ROOT = "/assets/web/"
private const val APP_START_URL = "https://$APP_ASSET_HOST${APP_ASSET_ROOT}index.html"

private class BundledAssetWebViewClient(
    context: Context,
    private val onPageLoaded: () -> Unit,
    private val onPageFailed: (String) -> Unit,
) : WebViewClient() {
    private val assets = context.applicationContext.assets

    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?,
    ): WebResourceResponse? {
        val uri = request?.url ?: return null
        val assetPath = uri.toBundledAssetPath() ?: return null
        return try {
            WebResourceResponse(
                mimeType(assetPath),
                if (assetPath.endsWith(".png") || assetPath.endsWith(".webp")) null else "UTF-8",
                assets.open(assetPath),
            ).apply {
                responseHeaders = mapOf(
                    "Cache-Control" to "no-cache",
                    "Access-Control-Allow-Origin" to "https://$APP_ASSET_HOST",
                )
            }
        } catch (_: IOException) {
            null
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return true
        return uri.scheme != "https" || uri.host != APP_ASSET_HOST
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        if (url == APP_START_URL) onPageLoaded()
    }

    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: WebResourceError?,
    ) {
        if (request?.isForMainFrame == true) {
            onPageFailed(error?.description?.toString() ?: "Embedded game failed to load")
        }
    }

    private fun Uri.toBundledAssetPath(): String? {
        if (scheme != "https" || host != APP_ASSET_HOST) return null
        val requestPath = path ?: return null
        if (!requestPath.startsWith(APP_ASSET_ROOT)) return null
        val relativePath = requestPath.removePrefix("/assets/")
        return relativePath.takeIf { it.startsWith("web/") && !it.split('/').contains("..") }
    }

    private fun mimeType(path: String): String = when (path.substringAfterLast('.', "")) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json", "webmanifest" -> "application/manifest+json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        else -> "application/octet-stream"
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SecureEmbeddedGame(
    reloadToken: Int,
    onPageLoaded: () -> Unit,
    onPageFailed: (String) -> Unit,
) {
    key(reloadToken) {
        val context = LocalContext.current
        val webView = remember(context, reloadToken) {
            WebView(context).apply {
                setBackgroundColor(Color.TRANSPARENT)
                webViewClient = BundledAssetWebViewClient(context, onPageLoaded, onPageFailed)
                webChromeClient = WebChromeClient()
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.userAgentString = "${settings.userAgentString} IslandATCSpatial/1.0.1"
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.allowFileAccessFromFileURLs = false
                settings.allowUniversalAccessFromFileURLs = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.mediaPlaybackRequiresUserGesture = false
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                isFocusable = true
                isFocusableInTouchMode = true
                requestFocus()
                loadUrl(APP_START_URL)
            }
        }

        DisposableEffect(webView) {
            onDispose {
                webView.stopLoading()
                webView.webChromeClient = null
                webView.destroy()
            }
        }

        AndroidView(modifier = Modifier.fillMaxSize(), factory = { webView })
    }
}
