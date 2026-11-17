"""여러 도메인(inspections, traceability)이 함께 쓰는 공용 enum."""

from enum import Enum


class Source(str, Enum):
    MONO = "MONO"
    COLOR = "COLOR"


class DefectType(str, Enum):
    NORMAL = "NORMAL"
    CRACK = "CRACK"
    BLOOD_SPOT = "BLOOD_SPOT"          # MONO 전용
    DISCOLORATION = "DISCOLORATION"
    FOREIGN_MATERIAL = "FOREIGN_MATERIAL"
    DEFORMED = "DEFORMED"


class RiskLevel(str, Enum):
    SAFE = "SAFE"
    WARN = "WARN"
    DANGER = "DANGER"


class RearingEnvironment(str, Enum):
    """난각번호 마지막 자리(사육환경번호). 국립축산과학원 기준 1~4 고정 4종."""

    FREE_RANGE = "1"
    BARN = "2"
    ENRICHED_CAGE = "3"
    CONVENTIONAL_CAGE = "4"


REARING_ENVIRONMENT_LABELS: dict[RearingEnvironment, str] = {
    RearingEnvironment.FREE_RANGE: "방사",
    RearingEnvironment.BARN: "평사",
    RearingEnvironment.ENRICHED_CAGE: "개선케이지",
    RearingEnvironment.CONVENTIONAL_CAGE: "기존케이지",
}
