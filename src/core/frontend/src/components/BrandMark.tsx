import { cn } from '@/lib/utils'

interface BrandMarkProps {
  className?: string
}

/** eggbenedet's logomark — an amber/gold egg outline that trails off into an
 *  open curl at the bottom, a glossy orange yolk sphere, and a dark-brown
 *  magnifying glass overlapping it (the quality-inspection cue). Recreated
 *  as an SVG so it stays crisp at every size the sidebar/login screens use
 *  it at. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="eggbenedet-yolk" cx="34%" cy="27%" r="76%">
          <stop offset="0%" stopColor="#ffe3a3" />
          <stop offset="45%" stopColor="#f7941e" />
          <stop offset="100%" stopColor="#dd7a0d" />
        </radialGradient>
      </defs>
      {/* egg outline, left half curling into an open tail at the bottom
          instead of closing into a plain oval */}
      <path
        d="M16.3 2.6c-5.15 0-9.75 8.05-9.75 14.85 0 3.55 1.55 6.2 4.15 7.7 1.85 1.05 4.15 1.5 6.75 1.15"
        fill="none"
        stroke="#f5a623"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      {/* right half, stopping short so the magnifying glass overlaps the gap */}
      <path
        d="M16.3 2.6c5.15 0 9.75 8.05 9.75 14.85 0 2.45-.7 4.5-1.9 6.1"
        fill="none"
        stroke="#f5a623"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <circle cx="14.3" cy="17.1" r="5.3" fill="url(#eggbenedet-yolk)" />
      <circle cx="20.7" cy="20.7" r="4.65" fill="#fdfaf4" stroke="#2b1810" strokeWidth="2.1" />
      <path d="M24 24 27.6 27.6" stroke="#2b1810" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

interface BrandWordmarkProps {
  className?: string
  textClassName?: string
}

/** The "eggbenedet" wordmark — "egg" in the same amber as the logomark's
 *  outline, "benedet" in the magnifying glass's dark brown. */
export function BrandWordmark({ className, textClassName }: BrandWordmarkProps) {
  return (
    <span className={cn('inline-block font-bold tracking-tight', className, textClassName)}>
      <span className="text-[#f5a623]">egg</span>
      <span className="text-[#2b1810]">benedet</span>
    </span>
  )
}
