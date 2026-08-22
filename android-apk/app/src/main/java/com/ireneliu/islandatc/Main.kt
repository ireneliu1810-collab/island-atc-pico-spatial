package com.ireneliu.islandatc

import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.foundation.dsl.DefaultWindowContainer
import com.pico.spatial.ui.foundation.dsl.SpatialAppScope
import com.ireneliu.islandatc.ui.islandatc.IslandAtcScreen

fun mainApp(scope: SpatialAppScope) =
    with(scope) {
        DefaultWindowContainer {
            PicoTheme {
                IslandAtcScreen()
            }
        }
    }
