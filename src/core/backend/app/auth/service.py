import bcrypt
from sqlalchemy.orm import Session

from app.auth.model import User
from app.config import ADMIN_EMAIL, ADMIN_PASSWORD


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))


def authenticate(db: Session, email: str, password: str) -> User | None:
    """users 테이블에서 조회 후 bcrypt로 비밀번호를 검증한다."""
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def seed_admin_if_empty(db: Session) -> None:
    if db.query(User).count() > 0:
        return
    db.add(
        User(
            user_id="1",
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            name="김검사",
            department="A동 검사관",
        )
    )
    db.commit()
