import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Spatial } from '@webspatial/core-sdk'
import { AIRSPACE_MAPS, IslandAtcGame, type GameSnapshot } from './game'

const initialSnapshot: GameSnapshot = {
  phase: 'standby', score: 0, landed: 0, combo: 0, level: 1, active: 0, risk: 0, reason: '',
  mapIndex: 0, mapName: AIRSPACE_MAPS[0].name, mapCode: AIRSPACE_MAPS[0].code,
  nextMapAt: AIRSPACE_MAPS[1].unlock, mapNotice: '',
}
const spatialStyle = (depth: number, material = 'thin') => ({ '--xr-back': `${depth}`, '--xr-background-material': material }) as CSSProperties

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<IslandAtcGame | null>(null)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [guideOpen, setGuideOpen] = useState(false)
  const [resultDismissed, setResultDismissed] = useState(false)
  const [spatialMode, setSpatialMode] = useState(false)
  const best = useMemo(() => Math.max(snapshot.score, Number(localStorage.getItem('island-atc-best') || 0)), [snapshot.score])

  useEffect(() => {
    if (snapshot.score >= best) localStorage.setItem('island-atc-best', String(snapshot.score))
  }, [snapshot.score, best])

  useEffect(() => {
    document.getElementById('boot-status')?.remove()
    const nativeSpatialContainer = /IslandATCSpatial\//i.test(navigator.userAgent)
    if (nativeSpatialContainer) setSpatialMode(true)
    else try { setSpatialMode(new Spatial().runInSpatialWeb()) } catch { setSpatialMode(false) }
    if (!canvasRef.current) return
    const game = new IslandAtcGame(canvasRef.current, setSnapshot)
    gameRef.current = game
    return () => game.destroy()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (spatialMode || params.get('pico-spatial-launch') !== '1') return
    if (!/PicoBrowser|PicoWebApp/i.test(navigator.userAgent)) return
    const target = new URL(window.location.href)
    target.searchParams.delete('pico-spatial-launch')
    const config = JSON.stringify({
      type: 'window',
      defaultSize: { width: '1600px', height: '980px' },
      worldScaling: 'automatic',
      worldAlignment: 'adaptive',
    })
    const spatialUrl = `webspatial://createSpatialScene?url=${encodeURIComponent(target.toString())}&config=${encodeURIComponent(config)}`
    const timer = window.setTimeout(() => window.location.assign(spatialUrl), 450)
    return () => window.clearTimeout(timer)
  }, [spatialMode])

  const start = () => {
    setGuideOpen(false)
    setResultDismissed(false)
    gameRef.current?.start()
  }

  const openGuide = () => {
    setResultDismissed(snapshot.phase === 'over')
    setGuideOpen(true)
  }

  const closeGuide = (returnToResult = false) => {
    setGuideOpen(false)
    setResultDismissed(snapshot.phase === 'over' && !returnToResult)
  }

  const multiplier = Math.min(4, 1 + Math.floor(snapshot.combo / 3))
  const rating = snapshot.landed >= 16 ? 5 : snapshot.landed >= 11 ? 4 : snapshot.landed >= 7 ? 3 : snapshot.landed >= 3 ? 2 : 1
  const activeMapIndex = snapshot.mapIndex ?? 0
  const activeMap = AIRSPACE_MAPS[activeMapIndex] ?? AIRSPACE_MAPS[0]
  const activeMapName = snapshot.mapName || activeMap.name
  const activeMapCode = snapshot.mapCode || activeMap.code
  const nextMapAt = snapshot.nextMapAt ?? AIRSPACE_MAPS[1].unlock
  const mapProgress = nextMapAt
    ? Math.min(100, Math.max(0, (snapshot.score - activeMap.unlock) / (nextMapAt - activeMap.unlock) * 100))
    : 100

  return (
    <main className={`app phase-${snapshot.phase} map-${activeMapIndex + 1}`}>
      <div className="aurora" />
      <div className="ambient-orbit orbit-a" />
      <div className="ambient-orbit orbit-b" />
      <header className="topbar glass" enable-xr="true" style={spatialStyle(40)}>
        <div className="brand-mark"><i /><span>IA</span></div>
        <div className="brand-copy">
          <small>PICO ISLAND AVIATION AUTHORITY · SECTOR 09</small>
          <h1>海岛航空管制中心 <em>/ ISLAND ATC</em></h1>
        </div>
        <div className="runtime">
          <span><i />{spatialMode ? 'PICO SPATIAL ONLINE' : 'WEB PREVIEW'}</span>
          <b>{snapshot.phase === 'playing' ? `MAP 0${activeMapIndex + 1} · LEVEL 0${snapshot.level}` : 'SYSTEM READY'}</b>
        </div>
        <div className="topbar-sheen" />
      </header>

      <section className="layout">
        <aside className="telemetry glass" enable-xr="true" style={spatialStyle(76)}>
          <PanelTitle index="01" overline="FLIGHT TELEMETRY" title="飞行遥测" />
          <div className="score-block"><small>CONTROL SCORE</small><strong>{snapshot.score.toString().padStart(6, '0')}</strong><span>BEST {best.toString().padStart(6, '0')}</span></div>
          <div className="radar-gauge" style={{ '--risk': `${snapshot.risk * 3.6}deg` } as CSSProperties}>
            <div><strong>{snapshot.risk}</strong><small>RISK</small></div>
          </div>
          <Metric label="空域风险" value={snapshot.risk} accent={snapshot.risk > 55} />
          <Metric label="活动航班" value={Math.min(100, snapshot.active * 16)} display={String(snapshot.active).padStart(2, '0')} />
          <div className="stat-grid"><span><small>安全落地</small><b>{snapshot.landed}</b></span><span><small>连续指挥</small><b>×{snapshot.combo}</b></span></div>
          <div className="tower-note"><i>◈</i><p><b>管制塔建议</b><span>{snapshot.risk > 55 ? '保持间隔，优先处理红色低油量航班。' : '选中航班并绘制平滑航路，避免急转。'}</span></p></div>
        </aside>

        <section className="field-column">
          <div className="field-label"><span>LIVE AIRSPACE / {activeMapCode}</span><b><i />{activeMapName}</b></div>
          <section className="airspace" enable-xr="true" style={spatialStyle(148, 'transparent')}>
            <canvas ref={canvasRef} aria-label="海岛航空管制游戏空域" />
            <div className="scan-grid" />
            <div className="viewport-vignette" />
            <div className="radar-sweep" />
            <div className="airspace-scale scale-left"><i /><i /><i /><i /><i /></div>
            <div className="airspace-scale scale-bottom"><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="corner c1" /><div className="corner c2" /><div className="corner c3" /><div className="corner c4" />
            <div className="compass"><b>N</b><i /><span>09</span></div>
            <div className="depth-tag">Z +148 · SPATIAL AIRSPACE</div>
            <div className="signal-tag"><i /> LIVE VECTOR FEED</div>

            {snapshot.mapNotice && (
              <div className="map-transition" enable-xr="true" style={spatialStyle(186, 'thin')}>
                <small>NEW AIRSPACE UNLOCKED</small>
                <strong>{snapshot.mapNotice}</strong>
                <span>{activeMapCode} · 航图与降落区已更新</span>
              </div>
            )}

            {snapshot.phase === 'standby' && !guideOpen && (
              <div className="modal briefing-card">
                <small>OPERATION TIDELINE · BRIEFING 01</small>
                <div className="island-emblem"><i /><i /><span>✈</span></div>
                <h2>接管群岛空域</h2>
                <p>绘制安全进场航线，在繁忙空域中引导每一架飞机和直升机顺利落地。</p>
                <div className="mission-chips"><span>动态流量</span><span>燃油管理</span><span>冲突预警</span></div>
                <button className="primary" onClick={start}><span>开始值班</span><i>TRIGGER →</i></button>
                <button className="text-button" onClick={openGuide}>查看管制手册</button>
              </div>
            )}

            {guideOpen && (
              <div className="modal guide-card">
                <small>CONTROL MANUAL · QUICK GUIDE</small>
                <h2>三步完成安全进场</h2>
                <div className="guide-steps">
                  <GuideStep number="01" title="锁定航班" text="用手柄射线或鼠标选中飞行器。下方燃油条变红时请优先处理。" />
                  <GuideStep number="02" title="绘制航路" text="按住并拖动，规划避开其他航班的平滑曲线。" />
                  <GuideStep number="03" title="匹配降落区" text="飞机由西侧对准任一跑道；直升机可选择任一黄色 H 停机坪。" />
                </div>
                {snapshot.phase === 'over' ? (
                  <>
                    <button className="primary" onClick={() => closeGuide(true)}><span>返回事故报告</span><i>REPORT →</i></button>
                    <button className="text-button" onClick={() => closeGuide(false)}>关闭手册并查看空域</button>
                  </>
                ) : (
                  <>
                    <button className="primary" onClick={start}><span>开始值班</span><i>READY →</i></button>
                    <button className="text-button" onClick={() => closeGuide(false)}>返回任务简报</button>
                  </>
                )}
              </div>
            )}

            {snapshot.phase === 'over' && !guideOpen && !resultDismissed && (
              <div className="modal result-card">
                <button className="modal-close" type="button" aria-label="关闭事故报告" onClick={() => setResultDismissed(true)}>×</button>
                <small>SHIFT TERMINATED · INCIDENT REPORT</small>
                <div className="incident-icon">△</div>
                <h2>空域暂时关闭</h2>
                <p>{snapshot.reason}</p>
                <div className="result-score"><span><small>本次得分</small><b>{snapshot.score}</b></span><span><small>安全落地</small><b>{snapshot.landed}</b></span><span><small>管制评级</small><b>{'★'.repeat(rating)}<em>{'★'.repeat(5 - rating)}</em></b></span></div>
                <button className="primary" onClick={start}><span>重新接管</span><i>RETRY →</i></button>
              </div>
            )}

            {snapshot.phase === 'over' && !guideOpen && resultDismissed && (
              <button className="report-reopen" type="button" onClick={() => setResultDismissed(false)}><i>△</i><span>查看事故报告</span><em>REPORT ↗</em></button>
            )}
          </section>
          <div className="status-strip glass" enable-xr="true" style={spatialStyle(96)}>
            <span><i className="green" />航路数据链</span><span><i className="green" />气象雷达</span><span><i className={snapshot.risk > 55 ? 'amber' : 'green'} />间隔监控</span><b>{snapshot.phase === 'playing' ? `SECTOR LOAD ${snapshot.active} · FLOW LEVEL ${snapshot.level}` : 'AWAITING CONTROLLER'}</b>
          </div>
        </section>

        <aside className="operations glass" enable-xr="true" style={spatialStyle(76)}>
          <PanelTitle index="02" overline="CONTROL PROTOCOL" title="运行协议" />
          <div className="objective"><small>CURRENT OBJECTIVE</small><strong>{snapshot.phase === 'playing' ? '维持安全间隔' : '等待接管空域'}</strong><p>{snapshot.phase === 'playing' ? '同时处理跑道与停机坪进场，低油量航班拥有最高优先级。' : '确认手柄射线可用，然后开始今日管制班次。'}</p></div>
          <div className="destinations"><small>LANDING ZONES</small><div><i className="runway-icon">09</i><p><b>固定翼跑道 ×{activeMap.runways}</b><span>西侧进入 · 可选任一跑道</span></p></div><div><i className="heli-icon">H</i><p><b>直升机坪 ×{activeMap.helipads}</b><span>全向进入 · 可选任一机坪</span></p></div></div>
          <div className="map-card">
            <small>AIRSPACE PROGRESSION</small>
            <div><span>0{activeMapIndex + 1}</span><p><b>{activeMapName}</b><em>{activeMapCode} · RWY {activeMap.runways} · PAD {activeMap.helipads}</em></p></div>
            <i><em style={{ width: `${mapProgress}%` }} /></i>
            <p>{nextMapAt ? `距离下一航区还需 ${Math.max(0, nextMapAt - snapshot.score).toLocaleString()} 分` : '全部航区已解锁'}</p>
          </div>
          <div className="combo-card"><small>SEPARATION STREAK</small><div><strong>×{multiplier}</strong><span>{snapshot.combo ? `${snapshot.combo} 次连续安全落地` : '连续落地提升积分倍率'}</span></div><div className="combo-dots">{[1, 2, 3, 4, 5, 6].map(value => <i key={value} className={snapshot.combo >= value ? 'lit' : ''} />)}</div></div>
          <div className="level-card"><small>TRAFFIC PHASE</small>{[1, 2, 3, 4, 5].map(level => <span key={level} className={snapshot.level >= level ? 'active' : ''}><i />0{level}</span>)}</div>
          <button className="manual-button" onClick={openGuide} disabled={snapshot.phase === 'playing'}>管制手册 <span>↗</span></button>
        </aside>
      </section>

      <footer className="input-dock glass" enable-xr="true" style={spatialStyle(112)}>
        <div><small>SPATIAL INPUT</small><b>射线锁定 · 按住拖拽 · 松开确认</b></div>
        <span><kbd>TRIGGER</kbd> 选择 / 绘制航路</span><span><kbd>RAY</kbd> 空间指向</span><em>NATIVE SPATIAL · BUILD 1.0.2</em>
      </footer>
    </main>
  )
}

function PanelTitle({ index, overline, title }: { index: string; overline: string; title: string }) {
  return <div className="panel-title"><span>{index}</span><div><small>{overline}</small><b>{title}</b></div></div>
}

function Metric({ label, value, display, accent = false }: { label: string; value: number; display?: string; accent?: boolean }) {
  return <div className={`metric ${accent ? 'accent' : ''}`}><span>{label}</span><b>{display ?? `${value}%`}</b><i><em style={{ width: `${value}%` }} /></i></div>
}

function GuideStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div><span>{number}</span><p><b>{title}</b><small>{text}</small></p></div>
}

export default App
