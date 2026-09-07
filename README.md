# Island Air Traffic Control Center

海岛航空管制中心是一款面向 PICO Spatial 平台的轻量航空管制游戏。玩家接管群岛机场空域，为固定翼飞机和直升机绘制安全进场航线，在燃油限制、航班冲突和逐步提升的流量压力下完成连续安全落地。

## 核心玩法

- 使用射线选择飞行器，按住并拖动绘制平滑航路，松开后确认航线。
- 引导固定翼飞机从跑道入口进场，引导直升机前往黄色 `H` 停机坪。
- 关注燃油、空域风险、活动航班和冲突预警，优先处理低油量航班。
- 连续安全落地可提升积分倍率；达到 4,000 和 10,000 分会解锁新航区。
- 三张地图具有不同设施规模：1 跑道/1 停机坪、1 跑道/2 停机坪、2 跑道/2 停机坪。

## PICO 交互方式

应用运行在 PICO Spatial 渐进式沉浸 Stage 中，远处使用海岛空域全景环境贴图，但舞台外不放置海岛沙盘、飞机、建筑等额外 3D 模型。游戏区内部采用斜视沙盘投影：海岛、跑道和停机坪具有分层厚度，飞机与地面阴影分离，航线贴地投影，降落时飞行高度逐步下降。用户通过手柄射线与 Trigger 完成选择和航路绘制。应用未实现眼动追踪、手势追踪、环境网格识别或多人联机。

## 技术栈

- Android / Kotlin / Jetpack Compose
- PICO Spatial SDK 6.0.0 与 SpatialUI
- Progressive Stage、SpatialView 与 AttachmentPanel
- 游戏内斜视投影、分层地形、设施厚度、航空器高度和贴地航线
- WebView → Kotlin 安全遥测桥接
- WebView 安全本地资源容器
- React 19、TypeScript 6、Vite 8
- WebSpatial SDK 1.7.0
- Canvas 2D 实时航空管制模拟与轻量 2.5D 投影渲染

网页构建产物会内置到 APK，并通过 `https://appassets.androidplatform.net/assets/web/index.html` 加载。应用不依赖 localhost、局域网或在线服务器。

## 本地运行前端

需要 Node.js 18 或更高版本：

```bash
npm ci
npm run dev
```

默认预览地址为 `http://127.0.0.1:5208/`。

代码检查与前端构建：

```bash
npm run lint
npm run build:apk-web
```

## 构建 PICO APK

需要 Android API 35、JDK 17 和可用的 PICO Spatial SDK 依赖环境：

```bash
npm run build:apk
```

Gradle 构建会先重新生成前端资源，再同步到 `android-apk/app/src/main/assets/web/`，避免 APK 内页面与源码版本不一致。

输出文件：

```text
android-apk/app/build/outputs/apk/debug/app-debug.apk
```

仓库中的当前真机测试包：

```text
release/Island-Air-Traffic-Control-Center-PICO-1.6.1.apk
```

APK 配置：

- Package：`com.ireneliu.islandatc`
- Version：`1.6.1`（versionCode 11）
- Android minSdk / targetSdk / compileSdk：35
- ABI：`arm64-v8a`
- Launcher：`.platform.LaunchActivity`
- Application：`.platform.SpatialApplication`

## 项目结构

```text
src/                         React 与游戏逻辑
public/                      Web manifest
android-apk/                 原生 PICO Spatial Android 工程
android-apk/app/src/main/    Kotlin、Manifest 与内置网页资源
scripts/                     网页资源同步脚本
release/                     可安装测试 APK
submission/                  提交用图片与说明素材
```

## 许可证

本项目用于 PICO Spatial 应用展示与测试。第三方依赖分别遵循其原始许可证。
