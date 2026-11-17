import { clockText, dateText } from '@/hooks/useSimClock'

interface LiveIndicatorProps {
  live: boolean
  tick: number
}

/** Icon + date + time, top-right of every screen header — one component so
 *  the dashboard and monitor screens can never drift out of sync with each
 *  other's sizing/position/wording. */
export function LiveIndicator({ live, tick }: LiveIndicatorProps) {
  return (
    <span className="flex items-center gap-1.75 font-mono text-xs tabular-nums text-muted-foreground">
      {live ? (
        <span className="size-2.75 animate-spin rounded-full border-2 border-cj-blue/22 border-t-cj-blue [animation-duration:0.9s]" />
      ) : (
        <span className="size-2.25 rounded-sm bg-zinc-400" />
      )}
      {dateText(tick)} | {clockText(tick)}
    </span>
  )
}
