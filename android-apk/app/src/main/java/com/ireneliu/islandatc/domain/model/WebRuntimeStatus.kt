package com.ireneliu.islandatc.domain.model

sealed interface WebRuntimeStatus {
    data object Loading : WebRuntimeStatus
    data object Ready : WebRuntimeStatus
    data class Error(val message: String) : WebRuntimeStatus
}
