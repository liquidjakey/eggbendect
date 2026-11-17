from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.schema import LoginRequest, LoginResponse
from app.auth.service import authenticate
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["인증"])


@router.post("/login", response_model=LoginResponse, summary="로그인")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """이메일/비밀번호로 로그인한다. 비밀번호는 bcrypt 해시로 대조한다.
    이후 요청을 인증하는 토큰 체계는 없다 - 프론트는 로그인 성공 여부만으로 세션을 유지한다."""
    user = authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    return LoginResponse(
        userId=user.user_id,
        email=user.email,
        message="로그인 성공",
        name=user.name,
        department=user.department,
    )
