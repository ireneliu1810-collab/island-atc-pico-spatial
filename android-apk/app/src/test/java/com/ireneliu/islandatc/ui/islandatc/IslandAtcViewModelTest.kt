package com.ireneliu.islandatc.ui.islandatc

import com.ireneliu.islandatc.domain.model.WebRuntimeStatus
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
}
