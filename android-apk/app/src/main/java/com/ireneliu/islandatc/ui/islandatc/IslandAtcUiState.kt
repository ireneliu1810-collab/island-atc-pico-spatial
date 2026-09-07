package com.ireneliu.islandatc.ui.islandatc

import com.ireneliu.islandatc.domain.model.WebRuntimeStatus
import com.ireneliu.islandatc.domain.model.SpatialFlightFrame

data class IslandAtcUiState(
    val status: WebRuntimeStatus = WebRuntimeStatus.Loading,
    val reloadToken: Int = 0,
    val spatialFlightFrame: SpatialFlightFrame = SpatialFlightFrame(),
)

sealed interface IslandAtcEvent {
    data object PageLoaded : IslandAtcEvent
    data class PageFailed(val message: String) : IslandAtcEvent
    data object RetryRequested : IslandAtcEvent
    data class SpatialFlightFrameReceived(val frame: SpatialFlightFrame) : IslandAtcEvent
}
