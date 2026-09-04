plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.ireneliu.islandatc"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ireneliu.islandatc"
        minSdk = 35
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk { abiFilters.add("arm64-v8a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
    }
}

val webProjectRoot = rootProject.projectDir.parentFile
val webDistDir = webProjectRoot.resolve("dist")
val embeddedWebDir = layout.projectDirectory.dir("src/main/assets/web")

val buildEmbeddedWeb by tasks.registering(Exec::class) {
    workingDir(webProjectRoot)
    commandLine("npm", "run", "build:apk-web")
    inputs.files(fileTree(webProjectRoot.resolve("src")))
    inputs.files(
        webProjectRoot.resolve("index.html"),
        webProjectRoot.resolve("package.json"),
        webProjectRoot.resolve("package-lock.json"),
        webProjectRoot.resolve("vite.config.ts")
    )
    outputs.dir(webDistDir)
}

val syncEmbeddedWebAssets by tasks.registering(Sync::class) {
    dependsOn(buildEmbeddedWeb)
    from(webDistDir)
    into(embeddedWebDir)
}

tasks.named("preBuild").configure {
    dependsOn(syncEmbeddedWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.0")
    implementation(platform("com.pico.spatial:bom:6.0.0"))
    implementation("com.pico.spatial.core:core")
    implementation("com.pico.spatial.ui:platform")
    implementation("com.pico.spatial.ui:foundation")
    implementation("com.pico.spatial.ui:design")
    implementation("com.pico.spatial.sense:sense")
    implementation("com.pico.spatial.tracking:tracking")
    implementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.annotation:annotation:1.7.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    debugImplementation("androidx.compose.ui:ui-tooling-preview")
}

configurations.all {
    resolutionStrategy {
        exclude("androidx.compose.ui", "ui")
        exclude("androidx.compose.ui", "ui-graphics")
        exclude("androidx.compose.ui", "ui-text")
        exclude("androidx.compose.foundation", "foundation")
    }
}
