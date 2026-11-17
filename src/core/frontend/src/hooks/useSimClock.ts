import { useEffect, useState } from 'react'

// Anchored to the real wall clock at module load (now that the dashboard is
// backed by live inspection data, "now" needs to track the actual current
// hour/date — not a fixed demo timestamp).
const SIM_BASE = new Date()

/** Ticks once a second while `live` is true; paused ticks freeze the on-screen clock. */
export function useSimClock(live: boolean) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [live])

  return tick
}

/** The sim clock's actual Date object for a given tick — exported so
 *  components that need real date arithmetic (e.g. a calendar picker) don't
 *  have to re-derive it from the formatted text helpers below. */
export function simDate(tick: number): Date {
  const d = new Date(SIM_BASE)
  d.setSeconds(d.getSeconds() + tick)
  return d
}

export function clockText(tick: number): string {
  const d = simDate(tick)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function dateText(tick: number): string {
  const d = simDate(tick)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

/** Current hour (0-23) plus how far through it we are (0 = just started,
 *  <1 = still in progress) — drives the hourly-volume chart's "only hours
 *  that have actually happened have data, and the current hour fills in as
 *  its minutes pass" behavior. `minute` is the live minute-of-hour, for
 *  readouts that want to echo the top-right clock's "N시 N분" wording. */
export function simHourProgress(tick: number): { hour: number; fraction: number; minute: number } {
  const d = simDate(tick)
  return { hour: d.getHours(), fraction: (d.getMinutes() * 60 + d.getSeconds()) / 3600, minute: d.getMinutes() }
}
