package com.ireneliu.islandatc.spatial

import android.util.Log
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ireneliu.islandatc.ui.islandatc.IslandAtcScreen
import com.ireneliu.islandatc.ui.islandatc.IslandAtcViewModel
import com.pico.spatial.core.ecs.Entity
import com.pico.spatial.core.ecs.TransformComponent
import com.pico.spatial.core.math.EulerAngles
import com.pico.spatial.core.math.Vector3
import com.pico.spatial.ui.foundation.content.SpatialView

private const val MAIN_PANEL_ID = "island-atc-main-panel"
private const val LOG_TAG = "IslandATC.Stage"

/** The Stage intentionally contains only the game panel; all depth now belongs to gameplay. */
@Composable
fun IslandAtcStage() {
    val viewModel: IslandAtcViewModel = viewModel()

    SpatialView(
        update = { _, _ -> },
        initial = { content, attachments ->
            val stageRoot = Entity().apply { setName("IslandATC_Root") }
            content.addEntity(stageRoot)

            try {
                stageRoot.addChild(IslandAtcEnvironment.load())
                Log.i(LOG_TAG, "Island airspace panorama attached without outer 3D props")
            } catch (error: Throwable) {
                Log.e(LOG_TAG, "Island airspace panorama failed to load", error)
            }

            attachments.entity(id = MAIN_PANEL_ID)?.apply {
                setName("IslandATC_Game")
                components[TransformComponent::class.java]?.apply {
                    setPosition(Vector3(0f, 1.56f, -1.72f))
                    setEulerAngles(EulerAngles(0f, 0f, 0f))
                }
                stageRoot.addChild(this)
                Log.i(LOG_TAG, "Gameplay-only spatial panel attached; outer 3D props disabled")
            }
        },
        attachments = {
            AttachmentPanel(id = MAIN_PANEL_ID) {
                IslandAtcScreen(viewModel)
            }
        },
        modifier = Modifier.size(width = 900.dp, height = 540.dp),
    )
}
