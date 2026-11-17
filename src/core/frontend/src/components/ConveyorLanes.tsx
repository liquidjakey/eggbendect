import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Detection, ProductionLine } from '@/types'
import { REVIEW_CONFIDENCE_CUT, categoryColor } from '@/lib/metrics'
import { eggImageFor } from '@/lib/eggImages'
import { familyCategory, familyConfidence, type LineFamily } from '@/lib/lineFamily'
import { cn } from '@/lib/utils'

interface ConveyorLanesProps {
  line: ProductionLine
  detections: Detection[]
  live: boolean
  /** MONO/COLOR verdict to render. `null` for contexts with no family
   *  toggle (e.g. the dashboard preview modal) — falls back to each
   *  detection's merged verdict instead of a single model's. */
  family: LineFamily | null
  className?: string
}

const LANE_COUNT = 3
// Pixel geometry of one egg slot - has to match the `h-17 w-13` image size
// below, and needs enough room either side for the defect tag/label (wider
// than the egg itself, e.g. "이물질 · 0.97 확인") on a neighboring egg not to
// overlap it. All 3 lanes spawn in lockstep, so every egg lands at the same
// x as its same-tick neighbors in the other lanes - too wide a margin here
// reads as the belt dropping into separated clumps instead of a steady
// stream, so this is only as big as the tag needs.
const ITEM_WIDTH = 52
const ITEM_MARGIN = 22
const ITEM_PITCH = ITEM_WIDTH + ITEM_MARGIN * 2
// Belt speed is independent of the pitch above - it's how fast a real belt
// would run, not something that should change just because eggs are spaced
// differently. Deriving it from pitch (speed = items-per-lap * pitch /
// lap-seconds) made a tighter pitch quietly slow the whole belt down, which
// reads as the belt struggling/laboring rather than just being denser.
const SPEED_PX_PER_S = 73.2
const TRAVEL_START_PX = 1100 // right edge an egg spawns at (covers a wide monitor-page container too)
const TRAVEL_END_PX = -1600 // safely off the left edge of any realistic container width
const TRAVEL_PX = TRAVEL_START_PX - TRAVEL_END_PX
const TRAVEL_SECONDS = TRAVEL_PX / SPEED_PX_PER_S
// The belt's own track (the striped rail under the eggs) has to scroll at
// the same `SPEED_PX_PER_S` the eggs move at, or it reads as the eggs
// sliding over a belt that isn't actually turning. `STRIPE_PX` is the
// repeating-gradient's own repeat width (see the track's `bg-[...]` below)
// - scrolling exactly one stripe's worth loops seamlessly.
const STRIPE_PX = 88
const BELT_SCROLL_SECONDS = STRIPE_PX / SPEED_PX_PER_S
// Time for one pitch-width of belt travel at that speed - how often a new
// egg spawns, and the unit the initial-fill stagger below counts in.
const PITCH_SECONDS = ITEM_PITCH / SPEED_PX_PER_S
const SPAWN_INTERVAL_MS = PITCH_SECONDS * 1000
// All 3 lanes spawning at the exact same instant puts every tick's 3 eggs at
// the exact same x, which reads as the belt moving in separated 3-wide
// clumps rather than a single stream - offsetting each lane's timing by a
// fraction of the spawn interval interleaves them instead.
const LANE_STAGGER_MS = SPAWN_INTERVAL_MS / LANE_COUNT
// How many eggs it takes, at natural pitch spacing, to span the *entire*
// visible travel distance (not just one lap) - used only to seed a brand-new
// belt so it looks already-running end to end instead of just the right half.
const SEED_COUNT = Math.ceil(TRAVEL_START_PX / ITEM_PITCH) + 1
const MAX_ITEMS_PER_LANE = SEED_COUNT * 4 // generous cap so a long-open tab doesn't grow this forever

/** A stable snapshot of "when did this egg really spawn", shared across
 *  every ConveyorLanes instance for a given line (see `beltStore` below) -
 *  this is what makes a late-mounting viewer (e.g. switching from the
 *  dashboard preview to the monitor page) show the egg in its true current
 *  position instead of restarting the belt from scratch. */
interface StoredItem {
  id: number
  det: Detection | null
  spawnedAtMs: number
}

interface BeltState {
  lanes: StoredItem[][]
  idCounter: number
  cursor: number
  /** Was this line stopped as of the last time *any* instance checked - lives
   *  here instead of as component-local state so two instances watching the
   *  same line (the dashboard preview modal and the monitor page) or a
   *  remount from switching lines and back can't each think they're the
   *  first to observe a stop -> running transition and reseed twice, which
   *  leaves a piece of the older seed's tail stranded mid-belt as a gap. */
  wasStopped: boolean
}

/** What actually gets rendered. `delay` is computed once - either when this
 *  instance first adopts an item from the shared store, or at the moment it
 *  spawns one itself - and then never recalculated. Recomputing an already-
 *  running item's `animation-delay` from `Date.now()` on every re-render
 *  would fight the browser's own compositor-driven timeline and cause visible
 *  jumps, so once an item has a `delay` it's treated as immutable. */
interface RenderItem {
  id: number
  det: Detection | null
  delay: number
}

// Belt contents keyed by line - lives outside the component so the dashboard
// preview modal and the monitor page (two separate ConveyorLanes instances,
// since neither remounts the other) show the *same* eggs for the same line
// instead of each silently running its own independent simulation. Plain
// module state is enough here: it only needs to survive within one page
// session, not across reloads.
const beltStore = new Map<string, BeltState>()

function seedBelt(detections: Detection[], stopped: boolean): BeltState {
  const buckets: Detection[][] = Array.from({ length: LANE_COUNT }, () => [])
  detections.forEach((d, i) => buckets[i % LANE_COUNT].push(d))
  let idCounter = 0
  const now = Date.now()
  const lanes = buckets.map((bucket, laneIdx) =>
    Array.from({ length: SEED_COUNT }, (_, i) => ({
      id: idCounter++,
      det: bucket[i % Math.max(bucket.length, 1)] ?? null,
      // Stagger initial eggs across the *entire* travel distance (oldest =
      // furthest left = spawned furthest in the "past") so the belt looks
      // already running end-to-end the moment you look at it, the same way
      // it would if the line had really been running for a while. The extra
      // per-lane offset below offsets each lane's eggs from the other two so
      // the same tick's eggs don't all land at the same x (see
      // `LANE_STAGGER_MS`) - `(laneIdx - (LANE_COUNT - 1))` rather than
      // plain `laneIdx` because the spawn effect *also* staggers each lane's
      // first real spawn by `laneIdx * LANE_STAGGER_MS` (it cycles lane 0,
      // 1, 2, ... one at a time): stacking a second, same-signed offset here
      // on top of that compounded instead of cancelling out, so the seed's
      // newest (i = SEED_COUNT-1) egg in the last lane of the cycle ended up
      // ~1.67 pitches before that lane's first real spawn - over the 1.5x
      // threshold `healLane` treats as a hole, so it silently inserted an
      // extra filler right there on that lane's very first tick, landing it
      // well under a pitch from its neighbor. This form keeps every lane's
      // newest seeded egg exactly one pitch before its own first real spawn.
      spawnedAtMs: now - (SEED_COUNT - 1 - i) * PITCH_SECONDS * 1000 + (laneIdx - (LANE_COUNT - 1)) * LANE_STAGGER_MS,
    })),
  )
  return { lanes, idCounter, cursor: 0, wasStopped: stopped }
}

function toRenderItems(stored: StoredItem[], now: number): RenderItem[] {
  return stored.map((it) => ({ id: it.id, det: it.det, delay: -(now - it.spawnedAtMs) / 1000 }))
}

/** Returns a healed copy of `lane` (or the same array if nothing needed
 *  fixing) - fills both a short lane (fewer than `SEED_COUNT` eggs, so the
 *  belt hasn't reached back far enough to cover the full travel distance)
 *  and any internal gap between two eggs wider than a pitch and a half
 *  (eggs exist on both sides, but with old-vs-new spawn times too far apart
 *  - e.g. eggs that sat frozen through a pause and never got folded back
 *  into a continuous stream once things resumed). Both read as the same
 *  thing on screen - a stretch of empty track - so both get healed the same
 *  way: synthesize untagged filler eggs spaced one pitch apart to bridge the
 *  hole. Assumes `lane` is sorted oldest-first (spawnedAtMs ascending), which
 *  is how eggs are always appended.
 */
function healLane(lane: StoredItem[], now: number, idCounterRef: { current: number }): StoredItem[] {
  const pitchMs = PITCH_SECONDS * 1000
  const healed: StoredItem[] = []

  // A genuine long stop is already handled by the reseed-on-resume effect
  // above, which throws the whole belt away and starts clean - this is only
  // meant for smaller drift, so it never needs to synthesize more than a
  // full seed's worth of filler in one pass regardless of how large a gap
  // it's asked to bridge.
  const maxFiller = SEED_COUNT
  const oldestWanted = now - (SEED_COUNT - 1) * pitchMs
  let cursor = lane.length > 0 ? lane[0].spawnedAtMs : now
  while (cursor - pitchMs >= oldestWanted && healed.length < maxFiller) {
    cursor -= pitchMs
    healed.push({ id: idCounterRef.current++, det: null, spawnedAtMs: cursor })
  }

  for (let i = 0; i < lane.length; i++) {
    healed.push(lane[i])
    const next = lane[i + 1]
    if (!next) continue
    const gap = next.spawnedAtMs - lane[i].spawnedAtMs
    if (gap <= pitchMs * 1.5) continue
    // Spread fillers evenly across the gap instead of stepping fixed
    // `pitchMs` hops from `lane[i]` - that left a leftover fragment right
    // before `next` as small as ~0.5 pitch whenever the gap wasn't an exact
    // multiple of pitchMs, which put `next` visibly closer to its filler
    // than a normal-pitch neighbor (defect ring/tag included) ever is,
    // reading as two eggs overlapping.
    const n = Math.min(Math.round(gap / pitchMs) - 1, maxFiller)
    const step = gap / (n + 1)
    for (let k = 1; k <= n; k++) {
      healed.push({ id: idCounterRef.current++, det: null, spawnedAtMs: lane[i].spawnedAtMs + step * k })
    }
  }

  return healed.length === lane.length ? lane : healed
}

/** Illustrative conveyor-belt preview: three lanes of flowing eggs, using
 *  this line's real detections so the mix roughly matches its abnormal
 *  categories. Eggs are real DOM nodes with stable identity that spawn at
 *  the right edge and get removed once they've scrolled off the left. The
 *  sliding itself is a plain CSS `animation` (compositor-driven, immune to
 *  main-thread jank) - JS only adds/removes items periodically, it never
 *  drives the motion frame-by-frame. This is bespoke chrome no shadcn
 *  primitive covers, so it leans on plain Tailwind + the `egg-travel`
 *  keyframe in index.css. */
export function ConveyorLanes({ line, detections, live, family, className }: ConveyorLanesProps) {
  const stopped = line.status === 'stop'
  // 계란 사진(MONO 후광/COLOR 평광)은 이 라인이 실제로 어느 카메라인지에 달렸다 -
  // `family`는 판정 병합용 토글이라 대시보드 미리보기처럼 null일 수 있는데, 그 경우에도
  // 라인 자체의 소스는 항상 정해져 있으니 이미지 선택은 `family`가 아니라 `line.source`를 본다.
  const imageFamily: LineFamily = line.source === 'MONO' ? 'mono' : 'color'

  const detectionsRef = useRef(detections)
  useEffect(() => {
    detectionsRef.current = detections
  }, [detections])

  const adopt = (lineKey: string): RenderItem[][] => {
    let belt = beltStore.get(lineKey)
    if (!belt) {
      belt = seedBelt(detectionsRef.current, stopped)
      beltStore.set(lineKey, belt)
    }
    const now = Date.now()
    return belt.lanes.map((lane) => toRenderItems(lane, now))
  }

  const [lanes, setLanes] = useState<RenderItem[][]>(() => adopt(line.key))

  // Re-sync with the shared store whenever the viewed line changes (covers
  // first mount too) - if another instance already has this line's belt
  // going, adopt it (recomputing fresh `delay`s from the real spawn times)
  // instead of reseeding, so both views agree.
  useEffect(() => {
    setLanes(adopt(line.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.key])

  // A paused CSS animation holds its exact on-screen position rather than
  // jumping to wherever `spawnedAtMs` says it "should" be by now - a real
  // belt stopping mid-travel does the same. So after a stop/resume cycle
  // the old items are stranded exactly where the line stopped while newly
  // spawned ones start fresh at the right edge, leaving a gap between them.
  // A production line that resumes doesn't pick up where a frozen belt left
  // off, it starts moving again from a full line - so reseed from scratch
  // on every stopped -> running transition instead of carrying the stale
  // items forward. The "was it stopped" flag lives on the shared belt (see
  // `BeltState.wasStopped`), not a local ref, so whichever instance's effect
  // happens to run first for a given transition reseeds once and every
  // other instance watching the same line sees it's already been done.
  useEffect(() => {
    const belt = beltStore.get(line.key)
    if (belt?.wasStopped && !stopped) {
      const fresh = seedBelt(detectionsRef.current, stopped)
      beltStore.set(line.key, fresh)
      setLanes(fresh.lanes.map((lane) => toRenderItems(lane, Date.now())))
    } else if (belt) {
      belt.wasStopped = stopped
    }
  }, [stopped, line.key])

  useEffect(() => {
    if (stopped || !live) return
    // Spawns one lane at a time, `LANE_STAGGER_MS` apart (a third of the full
    // pitch interval), cycling through lanes - not all 3 on the same tick -
    // so eggs from different lanes don't all land at the same x (see
    // `LANE_STAGGER_MS`). Each lane still gets a new egg every
    // `SPAWN_INTERVAL_MS` overall, just offset from its neighbors.
    let laneCursor = 0
    const id = setInterval(() => {
      const belt = beltStore.get(line.key)
      if (!belt) return
      const laneIdx = laneCursor % LANE_COUNT
      laneCursor++
      // `source` is this line's slice of the dashboard's shared recent-
      // detections window (capped at a few hundred *across all lines*), not
      // a per-line feed - with several lines running at once it can easily
      // be momentarily empty for this one even though the line itself is
      // actively producing (`stopped` below is what actually reflects
      // that). Spawning is gated on the line really running, not on
      // whether this window happens to contain one of its rows right now -
      // otherwise the belt starves and drains empty while `stopped` still
      // says "running". Fall back to an untagged egg when there's nothing
      // to show yet instead of skipping the spawn.
      const now = Date.now()
      // Self-healing: whatever the exact cause (a mid-stream race, a remount
      // adopting a belt that never finished seeding, eggs that sat frozen
      // through a pause and came out the other side stranded), if this
      // lane's coverage has a hole - too short overall, or a gap between two
      // eggs wider than a pitch and a half - patch it right now instead of
      // waiting for one-at-a-time spawning to slowly refill it. A lane
      // that's supposed to be running should never sit there visibly sparse.
      const idCounterRef = { current: belt.idCounter }
      const healedLane = healLane(belt.lanes[laneIdx] ?? [], now, idCounterRef)
      if (healedLane !== belt.lanes[laneIdx]) {
        belt.idCounter = idCounterRef.current
        belt.lanes = belt.lanes.map((lane, i) => (i === laneIdx ? healedLane : lane))
        setLanes((prev) => prev.map((lane, i) => (i === laneIdx ? toRenderItems(healedLane, now) : lane)))
      }

      const source = detectionsRef.current
      const det = source.length ? source[belt.cursor % source.length] : null
      belt.cursor += 1
      const spawnedAtMs = now
      const spawnedStored: StoredItem = { id: belt.idCounter++, det, spawnedAtMs }
      belt.lanes = belt.lanes.map((lane, i) => {
        if (i !== laneIdx) return lane
        const next = [...lane, spawnedStored]
        return next.length > MAX_ITEMS_PER_LANE ? next.slice(next.length - MAX_ITEMS_PER_LANE) : next
      })
      // Existing on-screen eggs keep the exact `delay` they already have -
      // only the freshly spawned one is new, so only it needs a delay
      // computed (trivially ~0, it just spawned this instant).
      setLanes((prev) =>
        prev.map((lane, i) => {
          if (i !== laneIdx) return lane
          const trimmed = lane.length >= MAX_ITEMS_PER_LANE ? lane.slice(1) : lane
          return [...trimmed, { id: spawnedStored.id, det: spawnedStored.det, delay: -(Date.now() - spawnedAtMs) / 1000 }]
        }),
      )
    }, LANE_STAGGER_MS)
    return () => clearInterval(id)
  }, [stopped, live, line.key])

  return (
    <div
      className={cn(
        // shrink-0: this sits inside flex parents (the modal body) that would
        // otherwise be free to squeeze it below its intended size once the
        // dialog runs low on vertical room — which silently broke every
        // fixed-pixel offset below. A fixed size has to actually stay fixed.
        'relative flex flex-1 shrink-0 flex-col overflow-x-hidden overflow-y-visible rounded-2xl border border-[#33373f] bg-gradient-to-b from-[#1c1e24] to-[#2a2d35]',
        className,
      )}
    >
      {Array.from({ length: LANE_COUNT }).map((_, laneIdx) => {
        const laneNo = laneIdx + 1
        const items = lanes[laneIdx]
        const lensWarn = laneIdx === 1 && line.health === 'lens' && line.key === 'B1'

        return (
          <div
            key={laneNo}
            className={cn(
              // Fixed pixel offsets below (not %-centered) so the belt/eggs/
              // ring/tag stack sits in the same place regardless of how tall
              // flexbox ends up making this row — `min-h` guarantees there's
              // always enough of it for that stack (label + 34px tag headroom
              // + belt + a little breathing room underneath) to fit.
              'relative min-h-40 flex-1 overflow-x-hidden overflow-y-visible',
              laneIdx < LANE_COUNT - 1 && 'border-b border-white/7',
            )}
          >
            <div className="absolute top-2.25 left-3.5 z-2 flex items-center gap-2 font-mono text-[11px] text-[#8b909a]">
              LANE {laneNo}
              {lensWarn && <span className="text-cj-orange">렌즈 오염 경고</span>}
            </div>

            <div
              className="absolute inset-x-0 top-13 h-22.5 border-y-2 border-[#454a55] bg-[repeating-linear-gradient(90deg,#3a3e48_0_44px,#33373f_44px_88px)]"
              style={{
                animation: `belt-scroll ${BELT_SCROLL_SECONDS}s linear infinite`,
                animationPlayState: stopped || !live ? 'paused' : 'running',
              }}
            />

            <div className="absolute top-15.25 left-0 h-17 w-full">
              {items.map((it) => {
                const d = it.det
                const cat = d ? familyCategory(d, family) : '정상'
                const conf = d ? familyConfidence(d, family) : 0
                const color = d ? categoryColor(cat) : ''
                const low = d ? conf < REVIEW_CONFIDENCE_CUT : false
                return (
                  <div
                    key={it.id}
                    className="absolute top-0 left-0"
                    style={
                      {
                        width: ITEM_WIDTH,
                        '--egg-start': `${TRAVEL_START_PX}px`,
                        '--egg-end': `${TRAVEL_END_PX}px`,
                        animation: `egg-travel ${TRAVEL_SECONDS}s linear forwards`,
                        animationDelay: `${it.delay}s`,
                        animationPlayState: stopped || !live ? 'paused' : 'running',
                        opacity: stopped ? 0.4 : 1,
                      } as CSSProperties
                    }
                  >
                    <img
                      src={eggImageFor(cat, imageFamily)}
                      alt=""
                      className="h-17 w-13 object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.45)]"
                    />
                    {d && cat !== '정상' && (
                      <>
                        <div
                          className="absolute -inset-y-2.25 -inset-x-1.75 rounded-md border-[2.5px]"
                          style={{ borderColor: color, boxShadow: `0 0 0 4px ${low ? 'rgba(248,151,29,.22)' : 'rgba(239,21,30,.25)'}` }}
                        />
                        {/* Dropped the "확인" (low-confidence) suffix that lived
                           here before - it's the widest part of the label and
                           the full text (with that suffix) is still in the
                           "검출 대기열" list, so the belt tag only needs to be as
                           wide as it has to be to stay clear of a same-tick
                           neighbor at this pitch. */}
                        <div
                          className="absolute -top-8.5 left-1/2 -translate-x-1/2 rounded-md px-2 py-1.25 font-mono text-xs leading-none font-semibold whitespace-nowrap text-white"
                          style={{ background: color }}
                        >
                          {cat} · {conf.toFixed(2)}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {stopped && (
        <div className="absolute inset-0 z-3 flex flex-col items-center justify-center gap-2.5 bg-[#121418]/60 px-6 text-center text-white">
          <div className="text-base font-bold">{line.name} 정지</div>
          <div className="text-[13px] text-[#c8ccd4]">{line.stopNote ?? '가동 재개 시 검출이 재시작됩니다'}</div>
        </div>
      )}
    </div>
  )
}
