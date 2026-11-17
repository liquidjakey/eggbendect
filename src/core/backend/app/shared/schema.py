"""camelCase JSON <-> snake_case 파이썬을 자동 변환해주는 공용 Pydantic 베이스."""

from pydantic import BaseModel, ConfigDict


def to_camel(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
