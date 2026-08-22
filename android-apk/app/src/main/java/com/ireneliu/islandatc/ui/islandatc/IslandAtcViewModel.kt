package com.ireneliu.islandatc.ui.islandatc

import androidx.lifecycle.ViewModel
import com.ireneliu.islandatc.domain.model.WebRuntimeStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class IslandAtcViewModel : ViewModel() {
    private val _state = MutableStateFlow(IslandAtcUiState())
    val state: StateFlow<IslandAtcUiState> = _state.asStateFlow()

    fun onEvent(event: IslandAtcEvent) {
        when (event) {
            IslandAtcEvent.PageLoaded -> _state.update { it.copy(status = WebRuntimeStatus.Ready) }
            is IslandAtcEvent.PageFailed -> _state.update {
                it.copy(status = WebRuntimeStatus.Error(event.message))
            }
            IslandAtcEvent.RetryRequested -> _state.update {
                it.copy(status = WebRuntimeStatus.Loading, reloadToken = it.reloadToken + 1)
            }
        }
    }
}
