package com.ireneliu.islandatc.ui.islandatc.components

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.JavascriptInterface
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.ireneliu.islandatc.domain.model.SpatialFlightFrame
import java.io.ByteArrayInputStream
import java.io.IOException

private const val APP_ASSET_HOST = "appassets.androidplatform.net"
private const val APP_ASSET_ROOT = "/assets/web/"
private const val APP_START_URL = "https://$APP_ASSET_HOST${APP_ASSET_ROOT}index.html"
private const val LOG_TAG = "IslandATC.WebView"

private class SpatialFlightBridge(
    private val onFrame: (SpatialFlightFrame) -> Unit,
) {
    private var lastSummary = ""

    @JavascriptInterface
    fun onFlightFrame(payload: String) {
        try {
            val frame = SpatialFlightFrame.fromJson(payload)
            val routePoints = frame.flights.sumOf { it.route.size }
            val summary = "${frame.phase}:${frame.flights.size}:route$routePoints:map${frame.mapIndex + 1}"
            if (summary != lastSummary) {
                lastSummary = summary
                Log.i(LOG_TAG, "Spatial flight bridge $summary")
            }
            onFrame(frame)
        } catch (error: Throwable) {
            Log.w(LOG_TAG, "Ignored malformed spatial flight frame", error)
        }
    }
}

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
        } catch (error: IOException) {
            val message = "Missing bundled web asset: $assetPath"
            Log.e(LOG_TAG, message, error)
            view?.post { onPageFailed(message) }
            WebResourceResponse(
                "text/plain", "UTF-8", 404, "Not Found",
                mapOf("Cache-Control" to "no-store"),
                ByteArrayInputStream(message.toByteArray()),
            )
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return true
        return uri.scheme != "https" || uri.host != APP_ASSET_HOST
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        if (url != APP_START_URL || view == null) return
        view.postDelayed({
            view.evaluateJavascript(
                """
                (() => {
                  const pick = (selector) => {
                    const element = document.querySelector(selector);
                    if (!element) return null;
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    return {
                      selector,
                      rect: [rect.x, rect.y, rect.width, rect.height],
                      display: style.display,
                      visibility: style.visibility,
                      opacity: style.opacity,
                      color: style.color,
                      background: style.backgroundColor,
                      children: element.childElementCount
                    };
                  };
                  return JSON.stringify({
                    viewport: [innerWidth, innerHeight, devicePixelRatio],
                    readyState: document.readyState,
                    root: pick('#root'),
                    app: pick('.app'),
                    topbar: pick('.topbar'),
                    airspace: pick('.airspace'),
                    modal: pick('.modal'),
                    canvas: pick('canvas'),
                    bodyText: document.body.innerText.slice(0, 120)
                  });
                })()
                """.trimIndent(),
            ) { diagnostics ->
                Log.d(LOG_TAG, "DOM diagnostics: $diagnostics")
                if (diagnostics.contains("\\\"app\\\":{", ignoreCase = false)) {
                    Log.i(LOG_TAG, "Embedded game DOM is ready")
                    onPageLoaded()
                } else {
                    val message = "Embedded game loaded but rendered no content"
                    Log.e(LOG_TAG, message)
                    onPageFailed(message)
                }
            }
        }, 750L)
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

    override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
        val message = if (detail?.didCrash() == true) {
            "WebView renderer crashed"
        } else {
            "WebView renderer was terminated"
        }
        Log.e(LOG_TAG, "$message; priority=${detail?.rendererPriorityAtExit()}")
        onPageFailed(message)
        view?.destroy()
        return true
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

private class DiagnosticWebChromeClient : WebChromeClient() {
    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
        consoleMessage ?: return false
        val message = "${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
        when (consoleMessage.messageLevel()) {
            ConsoleMessage.MessageLevel.ERROR -> Log.e(LOG_TAG, message)
            ConsoleMessage.MessageLevel.WARNING -> Log.w(LOG_TAG, message)
            else -> Log.d(LOG_TAG, message)
        }
        return true
    }
}


@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SecureEmbeddedGame(
    reloadToken: Int,
    onPageLoaded: () -> Unit,
    onPageFailed: (String) -> Unit,
    onSpatialFlightFrame: (SpatialFlightFrame) -> Unit,
) {
    key(reloadToken) {
        val context = LocalContext.current
        val webView = remember(context, reloadToken) {
            WebView(context).apply {
                setBackgroundColor(Color.rgb(5, 27, 39))
                setLayerType(View.LAYER_TYPE_SOFTWARE, null)
                Log.i(LOG_TAG, "Using software-composited WebView layer for Spatial window")
                webViewClient = BundledAssetWebViewClient(context, onPageLoaded, onPageFailed)
                webChromeClient = DiagnosticWebChromeClient()
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.userAgentString = "${settings.userAgentString} IslandATCSpatial/1.6.1"
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
                addJavascriptInterface(
                    SpatialFlightBridge(onSpatialFlightFrame),
                    "IslandATCNative",
                )
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
