import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseProperties = Properties().apply {
    val config = rootProject.file("release.properties")
    if (config.exists()) config.inputStream().use { load(it) }
}
val uploadProperties = Properties().apply {
    val config = rootProject.file("key.properties")
    if (config.exists()) config.inputStream().use { load(it) }
}
val releaseAppId = releaseProperties.getProperty("applicationId", "com.touchmarkdes.recall")
val unsignedAudit = providers.gradleProperty("recallUnsignedAudit").orNull == "true"
val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
if (releaseRequested && !unsignedAudit) {
    require(releaseAppId != "com.example.recall_mobile" && !releaseAppId.contains("yourcompany")) {
        "Set a team-owned applicationId in android/release.properties before release."
    }
    require(listOf("storeFile", "storePassword", "keyAlias", "keyPassword").all {
        !uploadProperties.getProperty(it).isNullOrBlank()
    }) { "Configure android/key.properties with an upload key. Debug signing is never used for release." }
}

android {
    namespace = "com.example.recall_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = releaseAppId
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (uploadProperties.getProperty("storeFile") != null) {
            create("upload") {
                storeFile = file(uploadProperties.getProperty("storeFile"))
                storePassword = uploadProperties.getProperty("storePassword")
                keyAlias = uploadProperties.getProperty("keyAlias")
                keyPassword = uploadProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        release {
            signingConfig = if (unsignedAudit) null else signingConfigs.findByName("upload")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
