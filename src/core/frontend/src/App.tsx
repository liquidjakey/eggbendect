import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sidebar, type NavKey } from '@/components/Sidebar'
import { AlertBanner } from '@/components/AlertBanner'
import { Toaster } from '@/components/ui/sonner'
import { Dashboard } from '@/pages/Dashboard/Dashboard'
import { Monitor } from '@/pages/Monitor/Monitor'
import { Review } from '@/pages/Review/Review'
import { Lots } from '@/pages/Lots/Lots'
import { Login } from '@/pages/Login/Login'
import { getToken, setToken } from '@/lib/api'
import { useSimClock } from '@/hooks/useSimClock'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useLiveData } from '@/hooks/useLiveData'

const LIVE = true
const BUILT_SCREENS: NavKey[] = ['dashboard', 'monitor', 'review', 'lots']

const NAV_LABELS: Record<NavKey, string> = {
  dashboard: '품질 검사 대시보드',
  monitor: '생산라인 모니터링',
  review: '이상 계란 검토',
  lots: '난각번호 이력 조회',
}

function App() {
  const [authed, setAuthed] = useState(() => !!getToken())
  const [snbOpen, setSnbOpen] = useState(true)
  const [active, setActive] = useState<NavKey>('dashboard')
  const [bannerHidden, setBannerHidden] = useState(false)
  const [monitorFocusLine, setMonitorFocusLine] = useState<string | undefined>()
  const [monitorFocusTab, setMonitorFocusTab] = useState<'line' | 'eggs' | undefined>()
  const [lotsFocusCode, setLotsFocusCode] = useState<string | undefined>()

  const tick = useSimClock(LIVE)
  const { lines, detections, hourly, todayTrend, origins, alertLineKeys, error } = useLiveData(authed)
  const { stoppedLines } = useDashboardMetrics(lines)
  const overLines = useMemo(() => lines.filter((l) => alertLineKeys.includes(l.key)), [lines, alertLineKeys])

  useEffect(() => {
    if (error) toast(`데이터를 불러오지 못했습니다: ${error}`)
  }, [error])

  const handleNavigate = useCallback((key: NavKey) => {
    if (BUILT_SCREENS.includes(key)) {
      // A plain sidebar click is a fresh visit, not a "jump to X" — clear any
      // leftover focus request from a previous jump (banner / preview modal /
      // "이 난각번호 이력 조회") so it doesn't silently pre-fill this visit too.
      setMonitorFocusLine(undefined)
      setMonitorFocusTab(undefined)
      setLotsFocusCode(undefined)
      setActive(key)
      return
    }
    toast(`${NAV_LABELS[key]} 화면은 준비 중입니다`)
  }, [])

  const bannerLine = overLines[0] ?? stoppedLines[0] ?? null
  const banner = useMemo(() => {
    if (!bannerLine) return null
    const isOver = overLines.includes(bannerLine)
    return {
      text: isOver ? `${bannerLine.name} 이상률 초과 감지` : `${bannerLine.name} 정지`,
      sub: isOver
        ? `관리 기준 초과 · 이물질·크랙 비중이 높습니다 — 카메라 시야 점검을 권장합니다`
        : (bannerLine.stopNote ?? '가동 중지 상태입니다 · 재가동 전 점검 필요'),
    }
  }, [bannerLine, overLines])

  if (!authed) {
    return (
      <>
        <Login onLogin={() => setAuthed(true)} />
        <Toaster position="bottom-center" />
      </>
    )
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        open={snbOpen}
        onToggle={() => setSnbOpen((v) => !v)}
        active={active}
        onNavigate={handleNavigate}
        operatorName="김검사"
        operatorRole="A동 검사관"
        onLogout={() => {
          setToken(null)
          setAuthed(false)
          setActive('dashboard')
          toast('로그아웃되었습니다')
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {banner && !bannerHidden && (
          <AlertBanner
            text={banner.text}
            sub={banner.sub}
            onOpenLine={() => {
              setActive('monitor')
              setMonitorFocusLine(bannerLine!.key)
            }}
            onDismiss={() => setBannerHidden(true)}
          />
        )}

        {active === 'dashboard' && (
          <Dashboard
            lines={lines}
            detections={detections}
            hourly={hourly}
            todayTrend={todayTrend}
            origins={origins}
            live={LIVE}
            tick={tick}
            onRequestMonitor={(lineKey) => {
              setActive('monitor')
              setMonitorFocusLine(lineKey)
            }}
          />
        )}
        {active === 'monitor' && (
          <Monitor
            lines={lines}
            detections={detections}
            live={LIVE}
            tick={tick}
            focusLineKey={monitorFocusLine}
            focusTab={monitorFocusTab}
            onOpenTrace={(shellCode) => {
              setActive('lots')
              setLotsFocusCode(shellCode)
            }}
          />
        )}
        {active === 'review' && (
          <Review
            lines={lines}
            detections={detections}
            live={LIVE}
            tick={tick}
            onOpenTrace={(shellCode) => {
              setActive('lots')
              setLotsFocusCode(shellCode)
            }}
          />
        )}
        {active === 'lots' && (
          <Lots
            lines={lines}
            detections={detections}
            live={LIVE}
            tick={tick}
            focusCode={lotsFocusCode}
            onOpenEggList={() => {
              setActive('monitor')
              setMonitorFocusTab('eggs')
            }}
          />
        )}
      </div>

      <Toaster position="bottom-center" />
    </div>
  )
}

export default App
