import { useMemo } from 'react'
import type { ProductionLine } from '@/types'
import { FAMILY_LABEL, familyLineName, linesForFamily, type LineFamily } from '@/lib/lineFamily'
import type { ComboboxOptionGroup } from '@/components/ComboboxSelect'
import { cn } from '@/lib/utils'

/** Encodes both the line and which family's naming/verdicts to show, since the
 *  same physical line appears once under each family in the list. */
export function lineFamilyOptionValue(family: LineFamily, key: string): string {
  return `${family}:${key}`
}

export function parseLineFamilyOptionValue(value: string): { family: LineFamily; key: string } {
  const [family, key] = value.split(':')
  return { family: family as LineFamily, key }
}

/** MONO LINE / COLOR LINE option groups for the line comboboxes - 라인은 이제
 *  family별로 완전히 분리돼 있어서(Line.source), 그 family 소속 라인만 담는다. */
export function useLineFamilyGroups(lines: ProductionLine[]): ComboboxOptionGroup[] {
  return useMemo(
    () =>
      (['mono', 'color'] as const).map((family) => ({
        label: FAMILY_LABEL[family],
        items: linesForFamily(lines, family).map((l) => {
          const stopped = l.status === 'stop'
          return {
            value: lineFamilyOptionValue(family, l.key),
            label: familyLineName(lines, l.key),
            meta: (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-1.75 rounded-full', stopped ? 'bg-zinc-400' : 'bg-emerald-500')} />
                {stopped ? '정지' : '가동 중'}
              </span>
            ),
          }
        }),
      })),
    [lines],
  )
}
