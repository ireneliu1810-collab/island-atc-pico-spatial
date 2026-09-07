export type GamePhase = 'standby' | 'playing' | 'over'
export type AircraftKind = 'plane' | 'heli'

export interface GameSnapshot {
  phase: GamePhase
  score: number
  landed: number
  combo: number
  level: number
  active: number
  risk: number
  reason: string
  mapIndex: number
  mapName: string
  mapCode: string
  nextMapAt: number
  mapNotice: string
}

declare global {
  interface Window {
    IslandATCNative?: {
      onFlightFrame: (payload: string) => void
    }
  }
}

type Point = { x: number; y: number }
type RunwayZone = Point & { angle: number; length: number; start: string; end: string }
type Incoming = Point & { startX: number; startY: number; kind: AircraftKind; due: number }
type Aircraft = Point & {
  id: number
  kind: AircraftKind
  angle: number
  targetAngle: number
  speed: number
  fuel: number
  path: Point[]
  landing: number
  opacity: number
  selected: boolean
  emergency: boolean
}

const TAU = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export const AIRSPACE_MAPS = [
  { name: '珊瑚晴湾', code: 'CORAL BAY', unlock: 0, runways: 1, helipads: 1 },
  { name: '翡翠双岛', code: 'TWIN EMERALD', unlock: 4000, runways: 1, helipads: 2 },
  { name: '极光环礁', code: 'AURORA ATOLL', unlock: 10000, runways: 2, helipads: 2 },
] as const

const mapForScore = (score: number) => {
  let index = 0
  for (let i = AIRSPACE_MAPS.length - 1; i >= 0; i -= 1) {
    if (score >= AIRSPACE_MAPS[i].unlock) {
      index = i
      break
    }
  }
  return index
}

const createSnapshot = (phase: GamePhase): GameSnapshot => ({
  phase,
  score: 0,
  landed: 0,
  combo: 0,
  level: 1,
  active: 0,
  risk: 0,
  reason: '',
  mapIndex: 0,
  mapName: AIRSPACE_MAPS[0].name,
  mapCode: AIRSPACE_MAPS[0].code,
  nextMapAt: AIRSPACE_MAPS[1].unlock,
  mapNotice: '',
})

export class IslandAtcGame {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private snapshot: GameSnapshot = createSnapshot('standby')
  private aircraft: Aircraft[] = []
  private incoming: Incoming[] = []
  private selected: Aircraft | null = null
  private spawnClock = 1.4
  private lastIncomingKind: AircraftKind | null = null
  private lastTime = 0
  private lastDraw = 0
  private lastHud = 0
  private simulationAccumulator = 0
  private readonly frameInterval = /IslandATCSpatial\//i.test(navigator.userAgent) ? 1000 / 30 : 0
  private raf = 0
  private diagnosticStartTimer = 0
  private readonly spatialTestMode = /IslandATCSpatial\//i.test(navigator.userAgent)
    && new URLSearchParams(window.location.search).get('spatial-test') === '1'
  private id = 0
  private width = 1200
  private height = 760
  private dpr = 1
  private elapsed = 0
  private mapNoticeUntil = 0
  private previewMap = import.meta.env.DEV
    ? clamp(Number(new URLSearchParams(window.location.search).get('preview-map') || 1) - 1, 0, AIRSPACE_MAPS.length - 1)
    : 0
  private previewOver = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview-state') === 'over'
  private resizeObserver: ResizeObserver
  private onSnapshot: (snapshot: GameSnapshot) => void

  constructor(canvas: HTMLCanvasElement, onSnapshot: (snapshot: GameSnapshot) => void) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is unavailable')
    this.ctx = context
    this.onSnapshot = onSnapshot
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    this.resize()
    if (this.previewOver) {
      this.snapshot = { ...createSnapshot('over'), score: 6850, landed: 9, combo: 4, reason: '航班安全间隔低于最低标准，管制班次已自动结束。' }
      this.emit()
    }
    this.raf = requestAnimationFrame(this.frame)
    if (this.spatialTestMode) {
      this.diagnosticStartTimer = window.setTimeout(this.start, 450)
    }
  }

  start = () => {
    this.aircraft = []
    this.incoming = []
    this.selected = null
    this.spawnClock = 1.8
    this.lastIncomingKind = null
    this.elapsed = 0
    this.simulationAccumulator = 0
    this.mapNoticeUntil = 0
    this.snapshot = createSnapshot('playing')
    if (this.previewMap > 0) {
      const map = AIRSPACE_MAPS[this.previewMap]
      this.snapshot.score = map.unlock
      this.snapshot.mapIndex = this.previewMap
      this.snapshot.mapName = map.name
      this.snapshot.mapCode = map.code
      this.snapshot.nextMapAt = AIRSPACE_MAPS[this.previewMap + 1]?.unlock ?? 0
    }
    this.emit()
  }

  destroy = () => {
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.diagnosticStartTimer)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(640, rect.width)
    this.height = Math.max(420, rect.height)
    const nativeSpatialContainer = /IslandATCSpatial\//i.test(navigator.userAgent)
    this.dpr = nativeSpatialContainer ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const elapsedSeconds = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.25) : 0
    this.lastTime = now

    if (this.snapshot.phase === 'playing') {
      const fixedStep = 1 / 60
      this.simulationAccumulator += elapsedSeconds
      while (this.simulationAccumulator >= fixedStep) {
        this.update(fixedStep)
        this.simulationAccumulator -= fixedStep
      }
    } else {
      this.simulationAccumulator = 0
    }

    if (this.frameInterval && this.lastDraw && now - this.lastDraw < this.frameInterval) return
    this.lastDraw = now
    this.draw(now / 1000)
    if (now - this.lastHud > 120) {
      this.lastHud = now
      this.updateTelemetry()
    }
  }

  private update(dt: number) {
    this.elapsed += dt
    this.snapshot.level = Math.min(5, 1 + Math.floor(this.snapshot.landed / 6))
    this.spawnClock -= dt
    if (this.spawnClock <= 0) {
      const activeTraffic = this.aircraft.filter(craft => craft.landing === 0).length + this.incoming.length
      const trafficLimit = this.spatialTestMode ? 1 : [2, 2, 3, 3, 4][this.snapshot.level - 1]
      if (activeTraffic < trafficLimit) this.createIncoming()
      this.spawnClock = Math.max(3, 6.15 - this.snapshot.level * 0.38 - this.snapshot.landed * 0.012)
    }
    const now = performance.now()
    if (this.snapshot.mapNotice && now >= this.mapNoticeUntil) this.snapshot.mapNotice = ''
    this.incoming = this.incoming.filter(warning => {
      if (now >= warning.due) {
        this.aircraft.push(this.makeAircraft(warning))
        return false
      }
      return true
    })

    for (const craft of this.aircraft) {
      if (craft.landing > 0) {
        craft.landing += dt * 0.68
        craft.opacity = clamp(1 - (craft.landing - 0.2) * 1.1, 0, 1)
        craft.x += Math.cos(craft.angle) * craft.speed * dt * 0.45
        craft.y += Math.sin(craft.angle) * craft.speed * dt * 0.45
        continue
      }
      craft.fuel -= dt * (craft.kind === 'plane' ? 1.45 : 1.15)
      craft.emergency = craft.fuel < 22
      if (craft.fuel <= 0) {
        this.end('燃油耗尽 · 航班未能及时进场')
        return
      }
      const next = craft.path[0]
      if (next) {
        if (distance(craft, next) < 16) craft.path.shift()
        else craft.targetAngle = Math.atan2(next.y - craft.y, next.x - craft.x)
      }
      let diff = craft.targetAngle - craft.angle
      while (diff < -Math.PI) diff += TAU
      while (diff > Math.PI) diff -= TAU
      craft.angle += diff * Math.min(1, dt * (craft.kind === 'plane' ? 3.1 : 4.6))
      craft.x += Math.cos(craft.angle) * craft.speed * dt
      craft.y += Math.sin(craft.angle) * craft.speed * dt
      this.checkLanding(craft)
      if (craft.x < -140 || craft.x > this.width + 140 || craft.y < -140 || craft.y > this.height + 140) {
        this.snapshot.combo = 0
        craft.fuel = 0
      }
    }
    this.aircraft = this.aircraft.filter(craft => craft.landing < 1.1)

    for (let i = 0; i < this.aircraft.length; i += 1) {
      const a = this.aircraft[i]
      if (a.landing > 0) continue
      for (let j = i + 1; j < this.aircraft.length; j += 1) {
        const b = this.aircraft[j]
        if (b.landing === 0 && distance(a, b) < 38) {
          this.end('空中冲突 · 两架飞行器失去安全间隔')
          return
        }
      }
    }
  }

  private checkLanding(craft: Aircraft) {
    const { runways, pads, scale } = this.mapGeometry()
    if (craft.kind === 'heli') {
      const target = pads.find(pad => distance(craft, pad) < 36 * scale)
      if (target) this.land(craft, craft.angle)
      return
    }
    for (const runway of runways) {
      const entryDistance = -(runway.length / 2 - 34) * scale
      const entry = {
        x: runway.x + Math.cos(runway.angle) * entryDistance,
        y: runway.y + Math.sin(runway.angle) * entryDistance,
      }
      let angleDiff = craft.angle - runway.angle
      while (angleDiff < -Math.PI) angleDiff += TAU
      while (angleDiff > Math.PI) angleDiff -= TAU
      if (distance(craft, entry) < 42 * scale && Math.abs(angleDiff) < 0.48) {
        this.land(craft, runway.angle)
        return
      }
    }
  }

  private land(craft: Aircraft, angle: number) {
    craft.landing = 0.01
    craft.angle = angle
    craft.path = []
    craft.selected = false
    if (this.selected === craft) this.selected = null
    this.snapshot.landed += 1
    this.snapshot.combo += 1
    const multiplier = Math.min(4, 1 + Math.floor(this.snapshot.combo / 3))
    const fuelBonus = Math.round(craft.fuel * 2)
    this.snapshot.score += 500 * multiplier + fuelBonus
    const unlockedMap = mapForScore(this.snapshot.score)
    if (unlockedMap > this.snapshot.mapIndex) {
      const map = AIRSPACE_MAPS[unlockedMap]
      this.snapshot.mapIndex = unlockedMap
      this.snapshot.mapName = map.name
      this.snapshot.mapCode = map.code
      this.snapshot.nextMapAt = AIRSPACE_MAPS[unlockedMap + 1]?.unlock ?? 0
      this.snapshot.mapNotice = map.name
      this.mapNoticeUntil = performance.now() + 3200
      this.aircraft = []
      this.incoming = []
      this.spawnClock = 3.2
      this.lastIncomingKind = null
      navigator.vibrate?.([40, 30, 40, 30, 90])
    }
    navigator.vibrate?.([24, 22, 42])
    this.emit()
  }

  private end(reason: string) {
    this.snapshot.phase = 'over'
    this.snapshot.reason = reason
    this.selected = null
    this.aircraft.forEach(craft => { craft.selected = false })
    navigator.vibrate?.([90, 50, 120])
    this.emit()
  }

  private makeAircraft(warning: Incoming): Aircraft {
    const center = this.islandCenter()
    const angle = Math.atan2(center.y - warning.startY, center.x - warning.startX) + (Math.random() - 0.5) * 0.32
    const geometry = this.mapGeometry()
    const runwayEntry = {
      x: geometry.runways[0].x - Math.cos(geometry.runways[0].angle) * geometry.runways[0].length * geometry.scale * 0.42,
      y: geometry.runways[0].y - Math.sin(geometry.runways[0].angle) * geometry.runways[0].length * geometry.scale * 0.42,
    }
    const testRoute = warning.kind === 'heli'
      ? [center, geometry.pads[0]]
      : [{
          x: runwayEntry.x - Math.cos(geometry.runways[0].angle) * 150 * geometry.scale,
          y: runwayEntry.y - Math.sin(geometry.runways[0].angle) * 150 * geometry.scale,
        }, runwayEntry]
    return {
      id: ++this.id,
      kind: warning.kind,
      x: warning.startX,
      y: warning.startY,
      angle,
      targetAngle: angle,
      speed: (warning.kind === 'plane' ? 56 : 43) + this.snapshot.level * 2,
      fuel: 96 + Math.random() * 14,
      path: this.spatialTestMode ? testRoute : [],
      landing: 0,
      opacity: 1,
      selected: false,
      emergency: false,
    }
  }

  private createIncoming() {
    const margin = 44
    const edge = Math.floor(Math.random() * 4)
    const hasHelicopter = this.aircraft.some(craft => craft.landing === 0 && craft.kind === 'heli')
      || this.incoming.some(warning => warning.kind === 'heli')
    const canSpawnHelicopter = this.snapshot.level >= 2 || !hasHelicopter
    const wantsHelicopter = Math.random() < 0.24
    const kind: AircraftKind = canSpawnHelicopter && wantsHelicopter && this.lastIncomingKind !== 'heli' ? 'heli' : 'plane'
    let x = margin
    let y = margin
    let startX = -90
    let startY = margin
    if (edge === 0) {
      x = 100 + Math.random() * (this.width - 200); y = margin; startX = x; startY = -80
    } else if (edge === 1) {
      x = this.width - margin; y = 90 + Math.random() * (this.height - 180); startX = this.width + 80; startY = y
    } else if (edge === 2) {
      x = 100 + Math.random() * (this.width - 200); y = this.height - margin; startX = x; startY = this.height + 80
    } else {
      x = margin; y = 90 + Math.random() * (this.height - 180); startX = -80; startY = y
    }
    this.incoming.push({ x, y, startX, startY, kind, due: performance.now() + 1550 })
    this.lastIncomingKind = kind
  }

  private updateTelemetry() {
    const flying = this.aircraft.filter(craft => craft.landing === 0)
    let risk = 0
    for (let i = 0; i < flying.length; i += 1) {
      if (flying[i].fuel < 24) risk += 18
      for (let j = i + 1; j < flying.length; j += 1) {
        const gap = distance(flying[i], flying[j])
        if (gap < 120) risk += Math.round((120 - gap) * 0.55)
      }
    }
    this.snapshot.active = flying.length + this.incoming.length
    this.snapshot.risk = clamp(risk, 0, 99)
    this.emit()
    this.emitSpatialFlightFrame()
  }

  private emitSpatialFlightFrame() {
    const bridge = window.IslandATCNative
    if (!bridge) return
    const flights = this.aircraft.slice(0, 4).map(craft => ({
      id: craft.id,
      kind: craft.kind,
      x: craft.x,
      y: craft.y,
      angle: craft.angle,
      fuel: craft.fuel,
      selected: craft.selected,
      emergency: craft.emergency,
      landing: craft.landing,
      path: this.spatialRoute(craft.path),
    }))
    bridge.onFlightFrame(JSON.stringify({
      phase: this.snapshot.phase,
      mapIndex: this.snapshot.mapIndex,
      width: this.width,
      height: this.height,
      flights,
    }))
  }

  private spatialRoute(path: Point[]) {
    const maximumPoints = 6
    if (path.length <= maximumPoints) return path
    return Array.from({ length: maximumPoints }, (_, index) => {
      const sourceIndex = Math.round(index * (path.length - 1) / (maximumPoints - 1))
      return path[sourceIndex]
    })
  }

  private emit() {
    this.onSnapshot({ ...this.snapshot })
  }

  private point(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    return this.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.snapshot.phase !== 'playing') return
    const rect = this.canvas.getBoundingClientRect()
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const point = this.point(event)
    const craft = [...this.aircraft].reverse().find(item => item.landing === 0 && distance(this.aircraftScreenPosition(item), screenPoint) < 58)
    if (!craft) return
    event.preventDefault()
    this.canvas.setPointerCapture(event.pointerId)
    if (this.selected) this.selected.selected = false
    this.selected = craft
    craft.selected = true
    craft.path = [{ x: craft.x, y: craft.y }, point]
    navigator.vibrate?.(16)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.selected || !this.canvas.hasPointerCapture(event.pointerId)) return
    const point = this.point(event)
    const last = this.selected.path.at(-1)
    if (!last || distance(last, point) > 11) this.selected.path.push(point)
  }

  private onPointerUp = (event: PointerEvent) => {
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    if (this.selected) this.selected.selected = false
    this.selected = null
  }

  private islandCenter() {
    return { x: this.width * 0.52, y: this.height * 0.51 }
  }

  private islandLayout() {
    return {
      center: this.islandCenter(),
      scale: Math.min(this.width / 1120, this.height / 700),
    }
  }

  private readonly groundScaleY = 0.72
  private readonly groundShearX = -0.12

  private applyGroundProjection() {
    const center = this.islandCenter()
    this.ctx.translate(center.x, center.y)
    this.ctx.transform(1, 0, this.groundShearX, this.groundScaleY, 0, 0)
    this.ctx.translate(-center.x, -center.y)
  }

  private worldToScreen(point: Point): Point {
    const center = this.islandCenter()
    const dy = point.y - center.y
    return {
      x: point.x + this.groundShearX * dy,
      y: center.y + this.groundScaleY * dy,
    }
  }

  private screenToWorld(point: Point): Point {
    const center = this.islandCenter()
    const dy = (point.y - center.y) / this.groundScaleY
    return {
      x: point.x - this.groundShearX * dy,
      y: center.y + dy,
    }
  }

  private projectedAngle(angle: number) {
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    return Math.atan2(this.groundScaleY * dy, dx + this.groundShearX * dy)
  }

  private aircraftScreenPosition(craft: Aircraft): Point {
    const ground = this.worldToScreen(craft)
    const flightHeight = (craft.kind === 'plane' ? 30 : 24) * (1 - clamp(craft.landing, 0, 1)) + 5
    return { x: ground.x, y: ground.y - flightHeight }
  }

  private mapGeometry() {
    const { center, scale } = this.islandLayout()
    if (this.snapshot.mapIndex === 1) {
      return {
        center,
        scale,
        runways: [{ x: center.x + 55 * scale, y: center.y - 22 * scale, angle: 0.12, length: 380, start: '09', end: '27' }] satisfies RunwayZone[],
        pads: [
          { x: center.x - 286 * scale, y: center.y + 120 * scale },
          { x: center.x + 330 * scale, y: center.y + 112 * scale },
        ],
      }
    }
    if (this.snapshot.mapIndex === 2) {
      return {
        center,
        scale,
        runways: [
          { x: center.x + 62 * scale, y: center.y - 58 * scale, angle: -0.12, length: 292, start: '09', end: '27' },
          { x: center.x + 35 * scale, y: center.y + 78 * scale, angle: -0.12, length: 328, start: '10', end: '28' },
        ] satisfies RunwayZone[],
        pads: [
          { x: center.x + 316 * scale, y: center.y - 116 * scale },
          { x: center.x - 304 * scale, y: center.y + 132 * scale },
        ],
      }
    }
    return {
      center,
      scale,
      runways: [{ x: center.x, y: center.y, angle: -0.17, length: 380, start: '09', end: '27' }] satisfies RunwayZone[],
      pads: [{ x: center.x - 226 * scale, y: center.y + 112 * scale }],
    }
  }

  private draw(time: number) {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    this.drawSea(time)
    ctx.save()
    this.applyGroundProjection()
    this.drawIsland(time)
    ctx.restore()
    this.drawTraffic(time)
    this.drawIncoming(time)
    if (this.snapshot.phase === 'standby') this.drawStandbyTraffic(time)
  }

  private drawSea(time: number) {
    const ctx = this.ctx
    const seaColors = this.snapshot.mapIndex === 1
      ? ['#36d1c7', '#129a9b', '#075c74']
      : this.snapshot.mapIndex === 2
        ? ['#6fcde4', '#447fbd', '#303d78']
        : ['#35c4d8', '#159bb7', '#075c7c']
    const sea = ctx.createRadialGradient(this.width * 0.48, this.height * 0.46, 20, this.width * 0.5, this.height * 0.5, this.width * 0.7)
    sea.addColorStop(0, seaColors[0])
    sea.addColorStop(0.48, seaColors[1])
    sea.addColorStop(1, seaColors[2])
    ctx.fillStyle = sea
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.lineWidth = 1
    for (let row = 0; row < 12; row += 1) {
      const y = (row + 0.65) * this.height / 12
      ctx.beginPath()
      for (let x = -30; x <= this.width + 30; x += 26) {
        const wave = Math.sin(x * 0.018 + row * 1.7 + time * 0.7) * 3
        if (x === -30) ctx.moveTo(x, y + wave)
        else ctx.lineTo(x, y + wave)
      }
      ctx.strokeStyle = `rgba(211, 255, 250, ${0.08 + row % 3 * 0.025})`
      ctx.stroke()
    }
    const glow = ctx.createRadialGradient(this.width * 0.18, this.height * 0.12, 0, this.width * 0.18, this.height * 0.12, this.width * 0.42)
    glow.addColorStop(0, 'rgba(207, 255, 242, .24)')
    glow.addColorStop(1, 'rgba(7, 92, 124, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, this.width, this.height)
  }

  private islandPath(cx: number, cy: number, rx: number, ry: number, seed: number) {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i <= 40; i += 1) {
      const angle = i / 40 * TAU
      const wobble = 1 + Math.sin(angle * 5 + seed) * 0.045 + Math.cos(angle * 9 - seed) * 0.025
      const x = cx + Math.cos(angle) * rx * wobble
      const y = cy + Math.sin(angle) * ry * wobble
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  private drawIsland(time: number) {
    const ctx = this.ctx
    const { center: { x: cx, y: cy }, scale, runways, pads } = this.mapGeometry()
    const landCx = this.snapshot.mapIndex === 1 ? cx + 48 * scale : cx
    const landCy = this.snapshot.mapIndex === 1 ? cy - 25 * scale : cy
    const rx = (this.snapshot.mapIndex === 1 ? 292 : 344) * scale
    const ry = (this.snapshot.mapIndex === 1 ? 184 : 216) * scale
    const seed = 1.7 + this.snapshot.mapIndex * 1.35
    ctx.save()
    ctx.filter = `blur(${18 * scale}px)`
    this.islandPath(landCx + 18 * scale, landCy + 32 * scale, rx + 14 * scale, ry + 12 * scale, 0.4 + this.snapshot.mapIndex)
    ctx.fillStyle = 'rgba(0, 10, 20, .48)'
    ctx.fill()
    ctx.restore()

    for (let ring = 4; ring >= 1; ring -= 1) {
      this.islandPath(
        landCx,
        landCy + ring * 4 * scale,
        rx + ring * 13 * scale + Math.sin(time * .7 + ring) * 2,
        ry + ring * 9 * scale,
        ring,
      )
      ctx.strokeStyle = `rgba(219, 255, 252, ${0.12 + ring * 0.035})`
      ctx.lineWidth = Math.max(2, 4 * scale)
      ctx.stroke()
    }

    this.islandPath(landCx, landCy + 17 * scale, rx, ry, seed)
    const cliff = ctx.createLinearGradient(landCx, landCy - ry, landCx, landCy + ry)
    cliff.addColorStop(0, '#f1bd84')
    cliff.addColorStop(.5, '#dc9466')
    cliff.addColorStop(1, '#a75f4c')
    ctx.fillStyle = cliff
    ctx.fill()

    this.islandPath(landCx, landCy + 6 * scale, rx, ry, seed)
    const sand = ctx.createLinearGradient(landCx, landCy - ry, landCx, landCy + ry)
    sand.addColorStop(0, '#fff1c9')
    sand.addColorStop(.55, '#ffd59f')
    sand.addColorStop(1, '#eeb17c')
    ctx.fillStyle = sand
    ctx.fill()

    this.islandPath(landCx, landCy - 5 * scale, rx - 30 * scale, ry - 27 * scale, seed)
    const grass = ctx.createLinearGradient(landCx - rx, landCy - ry, landCx + rx, landCy + ry)
    grass.addColorStop(0, '#c9e987')
    grass.addColorStop(.48, '#8dc77d')
    grass.addColorStop(1, '#4f9b72')
    ctx.fillStyle = grass
    ctx.fill()
    ctx.strokeStyle = 'rgba(238, 255, 199, .42)'
    ctx.lineWidth = 2 * scale
    ctx.stroke()

    if (this.snapshot.mapIndex === 1) {
      pads.forEach((pad, index) => this.drawSatelliteIsland(pad.x, pad.y, 78 * scale, 55 * scale, scale, 4.4 + index * 1.3))
    }
    if (this.snapshot.mapIndex === 2) {
      this.drawLagoon(cx - 190 * scale, cy - 8 * scale, 65 * scale, 50 * scale, scale)
      pads.forEach((pad, index) => this.drawSatelliteIsland(pad.x, pad.y, 68 * scale, 50 * scale, scale, 7.2 + index * 1.5))
    }

    this.drawIslandDetails(landCx, landCy, rx, ry, scale, seed)
    runways.forEach(runway => {
      this.drawAirfieldApron(runway.x, runway.y, scale, runway.angle, runway.length)
      this.drawRunway(runway.x, runway.y, scale, runway, time)
    })
    pads.forEach(pad => this.drawHelipad(pad.x, pad.y, scale))
    const primaryRunway = runways[0]
    this.drawTower(primaryRunway.x + 104 * scale, primaryRunway.y - 88 * scale, scale, time)
    this.drawVegetation(landCx, landCy, scale, this.snapshot.mapIndex)
  }

  private drawSatelliteIsland(x: number, y: number, rx: number, ry: number, scale: number, seed: number) {
    const ctx = this.ctx
    this.islandPath(x + 6 * scale, y + 11 * scale, rx, ry, seed)
    ctx.fillStyle = '#b56f57'; ctx.fill()
    this.islandPath(x, y + 4 * scale, rx, ry, seed)
    ctx.fillStyle = '#ffe0aa'; ctx.fill()
    this.islandPath(x, y - 2 * scale, rx - 10 * scale, ry - 9 * scale, seed)
    ctx.fillStyle = this.snapshot.mapIndex === 2 ? '#a7d9b3' : '#80c68a'; ctx.fill()
    ctx.strokeStyle = 'rgba(239, 255, 217, .48)'; ctx.lineWidth = 2 * scale; ctx.stroke()
  }

  private drawLagoon(x: number, y: number, rx: number, ry: number, scale: number) {
    const ctx = this.ctx
    ctx.fillStyle = '#ffe2ac'
    ctx.beginPath(); ctx.ellipse(x, y, rx + 10 * scale, ry + 9 * scale, -.12, 0, TAU); ctx.fill()
    const lagoon = ctx.createRadialGradient(x - 18 * scale, y - 14 * scale, 2, x, y, rx)
    lagoon.addColorStop(0, '#9cf5e9'); lagoon.addColorStop(.62, '#40bed1'); lagoon.addColorStop(1, '#367fae')
    ctx.fillStyle = lagoon
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -.12, 0, TAU); ctx.fill()
    ctx.strokeStyle = 'rgba(224, 255, 251, .72)'; ctx.lineWidth = 3 * scale; ctx.stroke()
  }

  private drawAirfieldApron(cx: number, cy: number, scale: number, angle: number, length: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(cx + 4 * scale, cy + 2 * scale)
    ctx.rotate(angle)
    ctx.scale(scale * length / 380, scale)
    ctx.shadowColor = 'rgba(28, 68, 92, .25)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 8
    const apron = ctx.createLinearGradient(0, -82, 0, 78)
    apron.addColorStop(0, '#89a9bd')
    apron.addColorStop(.55, '#6e91a9')
    apron.addColorStop(1, '#567b96')
    ctx.fillStyle = apron
    ctx.beginPath()
    ctx.moveTo(-212, -69)
    ctx.bezierCurveTo(-142, -91, 92, -86, 203, -59)
    ctx.bezierCurveTo(224, -25, 218, 37, 184, 65)
    ctx.bezierCurveTo(73, 85, -120, 88, -205, 58)
    ctx.bezierCurveTo(-226, 25, -229, -30, -212, -69)
    ctx.closePath()
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = 'rgba(214, 238, 242, .45)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 228, 146, .34)'
    ctx.lineWidth = 1
    ctx.setLineDash([7, 9])
    ctx.beginPath(); ctx.moveTo(-190, 48); ctx.bezierCurveTo(-90, 64, 94, 64, 188, 43); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  private drawRunway(cx: number, cy: number, scale: number, runwayZone: RunwayZone, time: number) {
    const ctx = this.ctx
    const half = runwayZone.length / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(runwayZone.angle)
    ctx.scale(scale, scale)
    const runwaySide = ctx.createLinearGradient(0, -24, 0, 43)
    runwaySide.addColorStop(0, '#4b555d')
    runwaySide.addColorStop(1, '#101a22')
    ctx.fillStyle = runwaySide
    ctx.beginPath()
    ctx.roundRect(-half - 3, -29, runwayZone.length + 6, 72, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,.28)'
    ctx.beginPath()
    ctx.roundRect(-half, -24, runwayZone.length, 64, 12)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 208, 122, .28)'
    ctx.beginPath()
    ctx.roundRect(-half - 6, -39, runwayZone.length + 12, 70, 11)
    ctx.fill()
    const runway = ctx.createLinearGradient(0, -28, 0, 28)
    runway.addColorStop(0, '#3e474f')
    runway.addColorStop(0.5, '#252d35')
    runway.addColorStop(1, '#171f28')
    ctx.fillStyle = runway
    ctx.beginPath()
    ctx.roundRect(-half, -35, runwayZone.length, 66, 9)
    ctx.fill()
    ctx.strokeStyle = 'rgba(229, 241, 231, .36)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.strokeStyle = 'rgba(205,244,239,.8)'
    ctx.lineWidth = 2
    ctx.setLineDash([22, 16])
    ctx.beginPath(); ctx.moveTo(-half + 25, -2); ctx.lineTo(half - 25, -2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f4f0d9'
    for (const side of [-1, 1]) {
      const threshold = side * (half - 21)
      const direction = side > 0 ? -1 : 1
      for (let stripe = 0; stripe < 4; stripe += 1) {
        ctx.fillRect(threshold + direction * stripe * 7 - (side > 0 ? 5 : 0), -25, 4, 46)
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.8)'
    ctx.font = '700 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(runwayZone.start, -half + 42, 14)
    ctx.fillText(runwayZone.end, half - 42, -8)
    for (let light = -half + 12; light <= half - 12; light += 18) {
      const edgeLight = Math.abs(light) > half - 45 ? '#f8dc78' : '#a9fff0'
      ctx.fillStyle = edgeLight
      ctx.shadowColor = edgeLight
      ctx.shadowBlur = 5
      ctx.beginPath(); ctx.arc(light, -30, 1.6, 0, TAU); ctx.fill()
      ctx.beginPath(); ctx.arc(light, 26, 1.6, 0, TAU); ctx.fill()
    }
    ctx.shadowBlur = 0

    // Fixed-wing traffic is accepted from the local left threshold only.
    // Keep this cue outside the collision geometry so it remains a visual guide.
    const pulse = (Math.sin(time * 4.2) + 1) / 2
    const entryX = -half - 47
    ctx.save()
    ctx.shadowColor = '#63ffe0'
    ctx.shadowBlur = 8 + pulse * 8
    ctx.strokeStyle = `rgba(111, 255, 226, ${0.38 + pulse * 0.28})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(entryX - 42, -24, 76, 44, 11)
    ctx.stroke()
    ctx.fillStyle = 'rgba(5, 46, 54, .82)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#d7fff2'
    ctx.font = '800 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('进场  ENTRY', entryX - 4, -13)
    ctx.fillStyle = '#6affe1'
    for (let arrow = 0; arrow < 3; arrow += 1) {
      const x = entryX - 26 + arrow * 21 + pulse * 3
      ctx.beginPath()
      ctx.moveTo(x - 7, -3)
      ctx.lineTo(x + 3, 6)
      ctx.lineTo(x - 7, 15)
      ctx.lineTo(x - 2, 6)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#f7df72'
    ctx.beginPath(); ctx.arc(-half - 5, -29, 2.7 + pulse * 1.2, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(-half - 5, 25, 2.7 + pulse * 1.2, 0, TAU); ctx.fill()
    ctx.restore()
    ctx.restore()
  }

  private drawHelipad(x: number, y: number, scale: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    const pedestal = ctx.createLinearGradient(0, -25, 0, 38)
    pedestal.addColorStop(0, '#46666b')
    pedestal.addColorStop(1, '#102b33')
    ctx.fillStyle = pedestal
    ctx.beginPath(); ctx.ellipse(0, 8, 44, 31, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,.25)'
    ctx.beginPath(); ctx.ellipse(5, 9, 44, 31, 0, 0, TAU); ctx.fill()
    const pad = ctx.createRadialGradient(-8, -9, 2, 0, 0, 40)
    pad.addColorStop(0, '#67868b'); pad.addColorStop(.62, '#314e55'); pad.addColorStop(1, '#172f38')
    ctx.fillStyle = pad
    ctx.beginPath(); ctx.ellipse(0, 0, 42, 30, 0, 0, TAU); ctx.fill()
    ctx.strokeStyle = '#f5d464'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 24, 0, 0, TAU); ctx.stroke()
    ctx.strokeStyle = 'rgba(236,255,250,.32)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4])
    ctx.beginPath(); ctx.ellipse(0, 0, 27, 18, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#f8eab7'; ctx.font = '800 25px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 0, 0)
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * TAU
      const lightX = Math.cos(angle) * 38
      const lightY = Math.sin(angle) * 27
      ctx.fillStyle = index % 3 === 0 ? '#f7d76e' : '#9ef6e6'
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 5
      ctx.beginPath(); ctx.arc(lightX, lightY, 1.6, 0, TAU); ctx.fill()
    }
    ctx.shadowBlur = 0
    ctx.restore()
  }

  private drawTower(x: number, y: number, scale: number, time: number) {
    const ctx = this.ctx
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale)
    const beamAngle = Math.sin(time * .72) * .55 - .5
    ctx.save(); ctx.translate(2, -42); ctx.rotate(beamAngle)
    const beam = ctx.createLinearGradient(0, 0, 105, 0)
    beam.addColorStop(0, 'rgba(255,237,163,.42)'); beam.addColorStop(1, 'rgba(255,237,163,0)')
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(112, -18); ctx.lineTo(112, 18); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill(); ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(12, 27, 31, 12, -.2, 0, TAU); ctx.fill()
    const tower = ctx.createLinearGradient(-12, 0, 18, 0)
    tower.addColorStop(0, '#e3eee8'); tower.addColorStop(.5, '#fff8df'); tower.addColorStop(1, '#9db9b4')
    ctx.fillStyle = tower; ctx.beginPath(); ctx.moveTo(-12, 22); ctx.lineTo(-7, -24); ctx.lineTo(11, -24); ctx.lineTo(18, 22); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#da6f58'; ctx.beginPath(); ctx.moveTo(-9, 1); ctx.lineTo(15, 1); ctx.lineTo(17, 10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(21,57,65,.36)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5,-19); ctx.lineTo(13,18); ctx.moveTo(10,-19); ctx.lineTo(-7,18); ctx.stroke()
    ctx.fillStyle = '#102f3b'; ctx.beginPath(); ctx.roundRect(-15, -35, 32, 14, 3); ctx.fill()
    const glass = ctx.createLinearGradient(-10, -31, 12, -24); glass.addColorStop(0, '#7ee6dc'); glass.addColorStop(.5, '#d3fff2'); glass.addColorStop(1, '#378e98')
    ctx.fillStyle = glass; ctx.fillRect(-10, -31, 7, 7); ctx.fillRect(1, -31, 10, 7)
    ctx.fillStyle = '#d8e7df'; ctx.fillRect(-18, -39, 37, 4)
    ctx.fillStyle = '#c95f4d'; ctx.beginPath(); ctx.moveTo(-11,-39); ctx.lineTo(12,-39); ctx.lineTo(7,-47); ctx.lineTo(-6,-47); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#ffe590'; ctx.shadowColor = '#ffe590'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(1, -43, 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0
    ctx.restore()
  }

  private drawIslandDetails(cx: number, cy: number, rx: number, ry: number, scale: number, seed: number) {
    const ctx = this.ctx
    ctx.save()
    for (let index = 0; index < 26; index += 1) {
      const angle = index / 26 * TAU + seed * .07
      const radius = .76 + Math.sin(index * 2.17 + seed) * .07
      const x = cx + Math.cos(angle) * rx * radius
      const y = cy + Math.sin(angle) * ry * radius
      const size = (1.4 + index % 3) * scale
      ctx.fillStyle = index % 2 ? 'rgba(255,240,192,.28)' : 'rgba(37,105,76,.18)'
      ctx.beginPath(); ctx.ellipse(x, y, size * 1.7, size, angle, 0, TAU); ctx.fill()
    }
    for (let index = 0; index < 9; index += 1) {
      const angle = index / 9 * TAU + .35
      const x = cx + Math.cos(angle) * (rx + 8 * scale)
      const y = cy + Math.sin(angle) * (ry + 5 * scale)
      ctx.fillStyle = 'rgba(96,72,67,.38)'
      ctx.beginPath(); ctx.ellipse(x, y, (4 + index % 3) * scale, (2.5 + index % 2) * scale, angle, 0, TAU); ctx.fill()
    }
    ctx.restore()
  }

  private drawVegetation(cx: number, cy: number, scale: number, mapIndex: number) {
    const ctx = this.ctx
    const plants = mapIndex === 1
      ? [[-190,-66,.9],[-130,104,.72],[-42,-116,.82],[160,-70,.9],[205,54,.8],[95,112,.68]]
      : mapIndex === 2
        ? [[-250,-98,.74],[-226,92,.86],[-15,-142,.72],[215,45,.85],[120,132,.7],[238,-20,.66]]
        : [[-215,-70,1],[-272,42,.72],[-86,-112,.9],[172,-76,.85],[215,52,1],[128,108,.75],[-238,-8,.66],[54,-126,.65]]
    for (const [ox, oy, size] of plants) {
      const x = cx + ox * scale, y = cy + oy * scale
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 9, 15 * size, 7 * size, -.3, 0, TAU); ctx.fill()
      ctx.strokeStyle = '#785331'; ctx.lineWidth = 3 * size; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 2, y - 10 * size); ctx.stroke()
      const foliage = ctx.createRadialGradient(x - 4 * size, y - 15 * size, 1, x, y - 10 * size, 18 * size)
      foliage.addColorStop(0, '#68b886')
      foliage.addColorStop(1, '#28745c')
      ctx.fillStyle = foliage
      for (let i = 0; i < 5; i += 1) {
        const angle = i / 5 * TAU
        ctx.beginPath(); ctx.ellipse(x + Math.cos(angle) * 9 * size, y - 11 * size + Math.sin(angle) * 6 * size, 11 * size, 4 * size, angle, 0, TAU); ctx.fill()
      }
    }
  }

  private drawTraffic(time: number) {
    for (const craft of this.aircraft) {
      if (craft.path.length) {
        const ctx = this.ctx
        const routeStart = this.worldToScreen(craft)
        ctx.beginPath(); ctx.moveTo(routeStart.x, routeStart.y)
        craft.path.forEach(point => {
          const projected = this.worldToScreen(point)
          ctx.lineTo(projected.x, projected.y)
        })
        ctx.strokeStyle = craft.emergency ? 'rgba(255,119,100,.85)' : craft.selected ? 'rgba(139,255,233,.95)' : 'rgba(139,255,233,.3)'
        ctx.lineWidth = craft.selected ? 4 : 2
        ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([])
        const target = craft.path.at(-1)!
        const projectedTarget = this.worldToScreen(target)
        ctx.strokeStyle = craft.selected ? '#8bffe9' : 'rgba(139,255,233,.36)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.ellipse(projectedTarget.x, projectedTarget.y, 9, 6, 0, 0, TAU); ctx.stroke()
      }
      this.drawAircraft(craft, time)
    }
  }

  private drawAircraft(craft: Aircraft, time: number) {
    const ctx = this.ctx
    const scale = 1 - craft.landing * 0.38
    const ground = this.worldToScreen(craft)
    const screen = this.aircraftScreenPosition(craft)
    const angle = this.projectedAngle(craft.angle)
    ctx.save(); ctx.globalAlpha = craft.opacity
    ctx.translate(ground.x + 8 * scale, ground.y + 7 * scale); ctx.rotate(angle); ctx.scale(scale, scale * .72)
    ctx.fillStyle = 'rgba(0,7,12,.34)'
    if (craft.kind === 'plane') { ctx.beginPath(); ctx.ellipse(0, 0, 34, 11, 0, 0, TAU); ctx.fill(); ctx.fillRect(-8, -29, 18, 58) }
    else { ctx.beginPath(); ctx.ellipse(0, 0, 29, 13, 0, 0, TAU); ctx.fill(); ctx.fillRect(-30, -3, 34, 6) }
    ctx.restore()
    ctx.save(); ctx.globalAlpha = craft.opacity; ctx.translate(screen.x, screen.y); ctx.rotate(angle); ctx.scale(scale, scale)
    if (craft.selected || craft.emergency) {
      ctx.strokeStyle = craft.emergency ? '#ff796a' : '#8bffe9'; ctx.lineWidth = 2; ctx.setLineDash([4, 5])
      ctx.beginPath(); ctx.arc(0, 0, 43 + Math.sin(time * 7) * 2, 0, TAU); ctx.stroke(); ctx.setLineDash([])
    }
    if (craft.kind === 'plane') this.drawPlane(ctx)
    else this.drawHelicopter(ctx, time)
    ctx.restore()
    const fuelColor = craft.fuel < 22 ? '#ff796a' : '#91f3de'
    ctx.fillStyle = 'rgba(3,19,28,.8)'; ctx.beginPath(); ctx.roundRect(screen.x - 24, screen.y + 31, 48, 6, 3); ctx.fill()
    ctx.fillStyle = fuelColor; ctx.beginPath(); ctx.roundRect(screen.x - 23, screen.y + 32, 46 * craft.fuel / 100, 4, 2); ctx.fill()
  }

  private drawPlane(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,22,31,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4
    const body = ctx.createLinearGradient(-31, -9, 29, 9)
    body.addColorStop(0, '#8ebbc2'); body.addColorStop(.32, '#f6fbf4'); body.addColorStop(.62, '#ffffff'); body.addColorStop(1, '#65a0ae')
    ctx.fillStyle = body
    ctx.beginPath(); ctx.moveTo(35,0); ctx.quadraticCurveTo(27,-8,-10,-8); ctx.lineTo(-27,-17); ctx.lineTo(-24,-5); ctx.quadraticCurveTo(-31,-4,-35,0); ctx.quadraticCurveTo(-31,4,-24,5); ctx.lineTo(-27,17); ctx.lineTo(-10,8); ctx.quadraticCurveTo(27,8,35,0); ctx.fill()
    ctx.shadowColor = 'transparent'
    const wing = ctx.createLinearGradient(-6,-31,10,29); wing.addColorStop(0,'#35c1b5'); wing.addColorStop(.55,'#168f94'); wing.addColorStop(1,'#086376')
    ctx.fillStyle = wing; ctx.beginPath(); ctx.moveTo(9,-5); ctx.lineTo(-8,-31); ctx.lineTo(5,-29); ctx.lineTo(17,-5); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(9,5); ctx.lineTo(-8,31); ctx.lineTo(5,29); ctx.lineTo(17,5); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#177f86'; ctx.beginPath(); ctx.moveTo(-17,-5); ctx.lineTo(-30,-17); ctx.lineTo(-22,-17); ctx.lineTo(-9,-5); ctx.fill(); ctx.beginPath(); ctx.moveTo(-17,5); ctx.lineTo(-30,17); ctx.lineTo(-22,17); ctx.lineTo(-9,5); ctx.fill()
    ctx.fillStyle = '#103d4b'; ctx.beginPath(); ctx.moveTo(23,-5); ctx.quadraticCurveTo(36,0,23,5); ctx.quadraticCurveTo(27,0,23,-5); ctx.fill()
    ctx.fillStyle = '#23626d'; for (let window = -5; window <= 16; window += 7) { ctx.beginPath(); ctx.arc(window, -3.7, 1.3, 0, TAU); ctx.fill() }
    ctx.strokeStyle = 'rgba(13,84,91,.42)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-19,0); ctx.lineTo(27,0); ctx.stroke()
    ctx.fillStyle = '#f5d36d'; ctx.fillRect(-19,-8,8,2.5)
    ctx.fillStyle = '#ff6f63'; ctx.shadowColor = '#ff6f63'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(3,-29,1.7,0,TAU); ctx.fill(); ctx.shadowBlur = 0
    ctx.fillStyle = '#8effe9'; ctx.shadowColor = '#8effe9'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(3,29,1.7,0,TAU); ctx.fill(); ctx.restore()
  }

  private drawHelicopter(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save(); ctx.shadowColor = 'rgba(0,20,29,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4
    ctx.fillStyle = '#155f6b'; ctx.beginPath(); ctx.moveTo(-5,-4); ctx.lineTo(-35,-3); ctx.lineTo(-39,-8); ctx.lineTo(-40,8); ctx.lineTo(-35,3); ctx.lineTo(-5,4); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#56c7ba'; ctx.beginPath(); ctx.moveTo(-36,-2); ctx.lineTo(-45,-10); ctx.lineTo(-43,1); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-36,2); ctx.lineTo(-45,10); ctx.lineTo(-43,-1); ctx.closePath(); ctx.fill()
    const body = ctx.createLinearGradient(-15,-16,22,15); body.addColorStop(0,'#a7f0df'); body.addColorStop(.38,'#39b7a8'); body.addColorStop(.75,'#147982'); body.addColorStop(1,'#094a5b')
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-13,-12); ctx.quadraticCurveTo(3,-19,19,-11); ctx.quadraticCurveTo(30,0,19,11); ctx.quadraticCurveTo(3,19,-13,12); ctx.quadraticCurveTo(-22,0,-13,-12); ctx.fill(); ctx.shadowColor='transparent'
    const canopy = ctx.createLinearGradient(12,-11,25,10); canopy.addColorStop(0,'#b7fff0'); canopy.addColorStop(.35,'#4aa5aa'); canopy.addColorStop(1,'#123e50')
    ctx.fillStyle = canopy; ctx.beginPath(); ctx.moveTo(10,-11); ctx.quadraticCurveTo(29,-7,25,4); ctx.quadraticCurveTo(22,13,10,11); ctx.quadraticCurveTo(16,0,10,-11); ctx.fill()
    ctx.strokeStyle = 'rgba(223,255,248,.58)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8,14); ctx.lineTo(19,14); ctx.moveTo(-8,-14); ctx.lineTo(19,-14); ctx.moveTo(-3,10); ctx.lineTo(-8,14); ctx.moveTo(-3,-10); ctx.lineTo(-8,-14); ctx.stroke()
    ctx.fillStyle = '#f0d16f'; ctx.fillRect(-10,-7,11,2.5)
    ctx.save(); ctx.translate(2,0); ctx.rotate(time * 12); ctx.fillStyle='rgba(220,255,248,.55)'; ctx.beginPath(); ctx.roundRect(-42,-1.4,84,2.8,1.4); ctx.fill(); ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.roundRect(-42,-1.4,84,2.8,1.4); ctx.fill(); ctx.restore()
    ctx.fillStyle='#d8eee8'; ctx.beginPath(); ctx.arc(2,0,3.2,0,TAU); ctx.fill()
    ctx.fillStyle='#ff7767'; ctx.shadowColor='#ff7767'; ctx.shadowBlur=6; ctx.beginPath(); ctx.arc(-7,-13,1.6,0,TAU); ctx.fill(); ctx.shadowBlur=0; ctx.restore()
  }

  private drawIncoming(time: number) {
    const ctx = this.ctx
    for (const warning of this.incoming) {
      const pulse = 1 + Math.sin(time * 8) * .08
      const point = this.worldToScreen(warning)
      ctx.save(); ctx.translate(point.x, point.y); ctx.scale(pulse, pulse * .82)
      ctx.fillStyle = 'rgba(3,24,34,.82)'; ctx.strokeStyle = '#f2cf68'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0,0,24,0,TAU); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#f2cf68'; ctx.font='700 16px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(warning.kind === 'plane' ? '✈' : 'H',0,0)
      ctx.restore()
    }
  }

  private drawStandbyTraffic(time: number) {
    const ctx = this.ctx
    const center = this.islandCenter()
    const angle = time * .22
    const world = { x: center.x + Math.cos(angle) * 270, y: center.y + Math.sin(angle) * 150 }
    const screen = this.worldToScreen(world)
    ctx.save(); ctx.globalAlpha=.62; ctx.translate(screen.x, screen.y - 30); ctx.rotate(this.projectedAngle(angle + Math.PI / 2)); this.drawPlane(ctx); ctx.restore()
  }
}
