# Island Air Control PICO handoff

- Web source: `src/`; build with `npm run build:apk-web`.
- Native PICO app: `android-apk/`, package `com.ireneliu.islandatc`.
- The launcher remains `.platform.LaunchActivity`, inheriting `SpatialLaunchActivity`.
- The manifest Application remains `.platform.SpatialApplication`, which calls `launch(::mainApp)`.
- The app uses PICO Spatial SDK 6.0.0 and a progressive immersive `DefaultStage` on Android API 35, ARM64 only.
- Entry chain: `SpatialApplication` → `launch(::mainApp)` → `DefaultStage` → `IslandAtcStage` → `SpatialView` → `AttachmentPanel`.
- `IslandAtcStage.kt` attaches the main gameplay panel plus a texture-only `IslandAtcEnvironment`. Do not re-enable `TabletopSceneState` or add decorative 3D island, aircraft, or building entities outside the game.
- The game canvas owns the spatial presentation: a reversible isometric ground projection, layered island cliffs, raised runways and helipads, projected flight routes, and aircraft whose screen position is elevated above a separate ground shadow.
- Pointer input is inverse-projected back to simulation coordinates, while aircraft hit testing uses their elevated screen position. Keep this mapping intact when changing the projection.
- The trusted local WebView may still send bounded telemetry through `IslandATCNative`, but the Stage does not mirror that telemetry into native background entities.
- WebView startup logs use the tag `IslandATC.WebView`; the HTML boot surface remains visible if JavaScript fails before React mounts.
- The embedded game remains a software-layer WebView so its pixels are captured reliably into the Stage attachment panel.
- Native Spatial mode caps the Canvas backing scale at 1x, renders at 30 FPS, and disables continuous blur/animation effects to reduce software-composition latency. Simulation advances at a fixed 60 Hz independently of render FPS, preventing aircraft slow-motion when the emulator drops frames.
- Embedded web assets load from `https://appassets.androidplatform.net/assets/web/index.html` through local asset interception.
- Never introduce localhost, LAN URLs, `about:blank`, `file://`, `WebAppActivity`, or `com.picoxr.spacewebappp`.
- `assembleDebug` rebuilds and synchronizes the web bundle before packaging.
- Installable APK: `android-apk/app/build/outputs/apk/debug/app-debug.apk`.
- v1.6.1 restores the earlier island-airspace panorama and IBL as a distant environment texture while keeping all outer 3D props removed; gameplay depth remains inside the playable airspace.
