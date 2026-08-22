package com.ireneliu.islandatc.ui.islandatc

import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ireneliu.islandatc.ui.islandatc.components.SecureEmbeddedGame

@Composable
fun IslandAtcScreen(viewModel: IslandAtcViewModel = viewModel()) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    IslandAtcContent(state = state, onEvent = viewModel::onEvent)
}

@Composable
internal fun IslandAtcContent(
    state: IslandAtcUiState,
    onEvent: (IslandAtcEvent) -> Unit,
) {
    SecureEmbeddedGame(
        reloadToken = state.reloadToken,
        onPageLoaded = { onEvent(IslandAtcEvent.PageLoaded) },
        onPageFailed = { onEvent(IslandAtcEvent.PageFailed(it)) },
    )
}
