# Island Air Control PICO handoff

- Web source: `src/`; build with `npm run build:apk-web`.
- Native PICO app: `android-apk/`, package `com.ireneliu.islandatc`.
- The launcher remains `.platform.LaunchActivity`, inheriting `SpatialLaunchActivity`.
- The manifest Application remains `.platform.SpatialApplication`, which calls `launch(::mainApp)`.
- The app uses PICO Spatial SDK 0.13.3 and a planar `DefaultWindowContainer` on Android API 35, ARM64 only.
- Embedded web assets load from `https://appassets.androidplatform.net/assets/web/index.html` through local asset interception.
- Never introduce localhost, LAN URLs, `about:blank`, `file://`, `WebAppActivity`, or `com.picoxr.spacewebappp`.
- `assembleDebug` rebuilds and synchronizes the web bundle before packaging.
- Installable APK: `android-apk/app/build/outputs/apk/debug/app-debug.apk`.
