plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "app.velara.pos"
  compileSdk = 34

  defaultConfig {
    applicationId = "app.velara.pos"
    // A maquininha POS Digital roda Android 7 em diante.
    minSdk = 24
    targetSdk = 34
    versionCode = 1
    versionName = "1.0.0"
  }

  signingConfigs {
    create("release") {
      // Preenchido pelo workflow de build a partir dos segredos do repositório.
      val ks = System.getenv("KEYSTORE_FILE")
      if (ks != null) {
        storeFile = file(ks)
        storePassword = System.getenv("KEYSTORE_PASSWORD")
        keyAlias = System.getenv("KEY_ALIAS")
        keyPassword = System.getenv("KEY_PASSWORD")
        // As duas assinaturas: a v2 basta para Android 7 em diante, mas a
        // certificação da Getnet confere o pacote também pelo esquema antigo.
        enableV1Signing = true
        enableV2Signing = true
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      if (System.getenv("KEYSTORE_FILE") != null) {
        signingConfig = signingConfigs.getByName("release")
      }
    }
  }

  buildFeatures { buildConfig = true }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

dependencies {
  implementation("androidx.appcompat:appcompat:1.7.0")
}
