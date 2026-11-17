import normalImg from '@/assets/eggs/normal.png'
import crackImg from '@/assets/eggs/crack.png'
import bloodImg from '@/assets/eggs/blood.png'
import damageImg from '@/assets/eggs/damage.png'
import deformedImg from '@/assets/eggs/deformed.png'
import foreignImg from '@/assets/eggs/foreign.png'
import monoNormalImg from '@/assets/eggs/MONO_EGG_정상.png'
import monoCrackImg from '@/assets/eggs/MONO_EGG_크랙.png'
import monoBloodImg from '@/assets/eggs/MONO_EGG_혈반.png'
import monoDamageImg from '@/assets/eggs/MONO_EGG_탈색.png'
import monoDeformedImg from '@/assets/eggs/MONO_EGG_기형.png'
import monoForeignImg from '@/assets/eggs/MONO_EGG_이물질.png'
import type { EggCategory } from '@/types'
import type { LineFamily } from '@/lib/lineFamily'

/** Real egg photos (배경 제거) per detection category, for anywhere a mock
 *  egg icon used to stand in for one — the production-line conveyor first,
 *  possibly more later. Not exported — go through `eggImageFor` so a MONO
 *  screen can't accidentally end up showing COLOR's photo set. */
const EGG_IMAGE: Record<EggCategory, string> = {
  정상: normalImg,
  이물질: foreignImg,
  탈색: damageImg,
  혈반: bloodImg,
  크랙: crackImg,
  기형: deformedImg,
}

/** MONO line inspects by backlight/candling, so its category photos look
 *  different from COLOR's plain-light shots — same categories, separate
 *  image set. */
const MONO_EGG_IMAGE: Record<EggCategory, string> = {
  정상: monoNormalImg,
  이물질: monoForeignImg,
  탈색: monoDamageImg,
  혈반: monoBloodImg,
  크랙: monoCrackImg,
  기형: monoDeformedImg,
}

export function eggImageFor(cat: EggCategory, family: LineFamily | null): string {
  return family === 'mono' ? MONO_EGG_IMAGE[cat] : EGG_IMAGE[cat]
}
