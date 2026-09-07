package com.ireneliu.islandatc.domain.model

import org.json.JSONObject

data class SpatialRoutePoint(
    val x: Float,
    val y: Float,
)

data class SpatialFlight(
    val id: Int,
    val kind: String,
    val x: Float,
    val y: Float,
    val angleRadians: Float,
    val fuel: Float,
    val selected: Boolean,
    val emergency: Boolean,
    val landingProgress: Float,
    val route: List<SpatialRoutePoint>,
)

data class SpatialFlightFrame(
    val phase: String = "standby",
    val mapIndex: Int = 0,
    val width: Float = 1f,
    val height: Float = 1f,
    val flights: List<SpatialFlight> = emptyList(),
) {
    companion object {
        fun fromJson(payload: String): SpatialFlightFrame {
            val root = JSONObject(payload)
            val rawFlights = root.optJSONArray("flights")
            val flights = buildList {
                if (rawFlights == null) return@buildList
                for (index in 0 until minOf(rawFlights.length(), 4)) {
                    val item = rawFlights.optJSONObject(index) ?: continue
                    val rawRoute = item.optJSONArray("path")
                    val route = buildList {
                        if (rawRoute == null) return@buildList
                        for (routeIndex in 0 until minOf(rawRoute.length(), 6)) {
                            val point = rawRoute.optJSONObject(routeIndex) ?: continue
                            val x = point.optDouble("x", Double.NaN).toFloat()
                            val y = point.optDouble("y", Double.NaN).toFloat()
                            if (x.isFinite() && y.isFinite()) add(SpatialRoutePoint(x, y))
                        }
                    }
                    add(
                        SpatialFlight(
                            id = item.optInt("id"),
                            kind = item.optString("kind", "plane"),
                            x = item.optDouble("x").toFloat(),
                            y = item.optDouble("y").toFloat(),
                            angleRadians = item.optDouble("angle").toFloat(),
                            fuel = item.optDouble("fuel", 100.0).toFloat(),
                            selected = item.optBoolean("selected"),
                            emergency = item.optBoolean("emergency"),
                            landingProgress = item.optDouble("landing").toFloat(),
                            route = route,
                        ),
                    )
                }
            }
            return SpatialFlightFrame(
                phase = root.optString("phase", "standby"),
                mapIndex = root.optInt("mapIndex", 0).coerceIn(0, 2),
                width = root.optDouble("width", 1.0).toFloat().coerceAtLeast(1f),
                height = root.optDouble("height", 1.0).toFloat().coerceAtLeast(1f),
                flights = flights,
            )
        }
    }
}
