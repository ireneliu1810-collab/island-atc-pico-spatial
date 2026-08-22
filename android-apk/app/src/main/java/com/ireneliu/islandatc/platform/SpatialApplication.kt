package com.ireneliu.islandatc.platform

import android.app.Application
import com.pico.spatial.ui.foundation.dsl.launch
import com.ireneliu.islandatc.mainApp

class SpatialApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        launch(::mainApp)
    }
}
