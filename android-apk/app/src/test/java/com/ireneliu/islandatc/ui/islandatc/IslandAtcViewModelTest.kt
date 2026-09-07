package com.ireneliu.islandatc.ui.islandatc

import com.ireneliu.islandatc.domain.model.WebRuntimeStatus
import com.ireneliu.islandatc.domain.model.SpatialFlight
import com.ireneliu.islandatc.domain.model.SpatialFlightFrame
import com.ireneliu.islandatc.domain.model.SpatialRoutePoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IslandAtcViewModelTest {
    @Test
    fun initialStateIsLoading() {
        assertEquals(WebRuntimeStatus.Loading, IslandAtcViewModel().state.value.status)
    }

    @Test
    fun pageLoadedMarksRuntimeReady() {
        val viewModel = IslandAtcViewModel()
        viewModel.onEvent(IslandAtcEvent.PageLoaded)
        assertEquals(WebRuntimeStatus.Ready, viewModel.state.value.status)
    }

    @Test
    fun pageFailureKeepsTheFailureMessage() {
        val viewModel = IslandAtcViewModel()
        viewModel.onEvent(IslandAtcEvent.PageFailed("module load failed"))
        val status = viewModel.state.value.status
        assertTrue(status is WebRuntimeStatus.Error)
        assertEquals("module load failed", (status as WebRuntimeStatus.Error).message)
    }

    @Test
    fun retryReturnsToLoadingAndChangesReloadToken() {
        val viewModel = IslandAtcViewModel()
        viewModel.onEvent(IslandAtcEvent.PageFailed("failed"))
        viewModel.onEvent(IslandAtcEvent.RetryRequested)
        assertEquals(WebRuntimeStatus.Loading, viewModel.state.value.status)
        assertEquals(1, viewModel.state.value.reloadToken)
    }

    @Test
    fun spatialFlightFrameUpdatesNativeSceneState() {
        val viewModel = IslandAtcViewModel()
        val frame = SpatialFlightFrame(
            phase = "playing",
            width = 1200f,
            height = 760f,
            flights = listOf(
                SpatialFlight(
                    7, "plane", 320f, 180f, 1.25f, 18f, true, true, 0.2f,
                    listOf(SpatialRoutePoint(420f, 220f)),
                ),
            ),
        )

        viewModel.onEvent(IslandAtcEvent.SpatialFlightFrameReceived(frame))

        assertEquals(frame, viewModel.state.value.spatialFlightFrame)
    }

}
