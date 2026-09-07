package com.ireneliu.islandatc.spatial

import com.pico.spatial.core.ecs.Entity
import com.pico.spatial.core.ecs.ImageBasedLightSource
import com.pico.spatial.core.ecs.ModelComponent
import com.pico.spatial.core.ecs.StageEnvironmentLightingComponent
import com.pico.spatial.core.ecs.TransformComponent
import com.pico.spatial.core.ecs.resource.TextureCreateOption
import com.pico.spatial.core.ecs.resource.TextureEncoding
import com.pico.spatial.core.ecs.resource.TextureResource
import com.pico.spatial.core.ecs.resource.UnlitMaterial
import com.pico.spatial.core.math.EulerAngles

/** A texture-only tropical horizon. It intentionally contains no gameplay or prop entities. */
internal object IslandAtcEnvironment {
    suspend fun load(): Entity {
        val environmentRoot = Entity().apply { setName("IslandATC_Environment") }
        val skySphere = Entity.loadSuspend("asset://environment/Sky Sphere.usdz")
        environmentRoot.addChild(skySphere)
        environmentRoot.components[TransformComponent::class.java]?.setEulerAngles(
            EulerAngles(0f, 180f, 0f)
        )

        val panorama = TextureResource(
            "environment/island-airspace-panorama-v1.png",
            option = TextureCreateOption().apply { textureEncoding = TextureEncoding.LINEAR },
        )
        val skyMaterial = UnlitMaterial.create().apply { setBaseColorTexture(panorama) }
        requireNotNull(findModelEntity(skySphere)) {
            "PICO sky sphere asset contains no ModelComponent"
        }.components[ModelComponent::class.java]?.materials?.set(0, skyMaterial)

        val lighting = TextureResource(
            "environment/island-airspace-ibl.exr",
            option = TextureCreateOption().apply { textureEncoding = TextureEncoding.LINEAR },
        )
        environmentRoot.components[StageEnvironmentLightingComponent::class.java] =
            StageEnvironmentLightingComponent(ImageBasedLightSource.Single(lighting), 2.2f)
        return environmentRoot
    }

    private fun findModelEntity(entity: Entity): Entity? {
        if (entity.components[ModelComponent::class.java] != null) return entity
        entity.getChildren().forEach { child ->
            findModelEntity(child)?.let { return it }
        }
        return null
    }
}
